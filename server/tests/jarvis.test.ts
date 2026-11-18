import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { JarvisAI } from '../src/jarvis.js';
import { LocalStore } from '../src/state.js';
import { createApp } from '../src/app.js';
import { createProvider, ModelTurn } from '../src/providers.js';
function scripted(turns: ModelTurn[]) { return (() => ({ turn: async () => { const turn = turns.shift(); if (!turn) throw new Error('Unexpected provider call'); return turn; } })) as typeof createProvider; }
test('offline task titles preserve intent and require single-use confirmation', async () => {
  const ai = new JarvisAI({});
  assert.equal(ai.health().provider.configured, false);
  const response = await ai.processMessage('Créer tâche Vérifier le workflow n8n');
  assert.equal(ai.workspace().tasks.length, 0);
  const id = response.pendingActions![0].id;
  const snapshot = ai.listActions(); (snapshot[0].args as {title:string}).title = 'Changed';
  assert.equal((await ai.confirm(id)).action, 'action_executed');
  assert.equal(ai.workspace().tasks[0].title, 'Vérifier le workflow n8n');
  await assert.rejects(ai.confirm(id));
  const cancelled = await ai.processMessage('note Mon projet avance');
  ai.cancel(cancelled.pendingActions![0].id);
  assert.equal(ai.workspace().notes.length, 0);
  assert.equal((await ai.processMessage('météo')).action, 'model_unconfigured');
});
test('model read tools loop and validated mutation group never executes without approval', async () => {
  const store = new LocalStore(); store.update(state => { state.settings = {provider:'local',model:'fixture'}; });
  const ai = new JarvisAI({}, store, scripted([
    {text:'',calls:[{name:'system_status',args:{}}]},
    {text:'',calls:[{name:'save_note',args:{title:'Préférence',content:'Réponses en français'}}]}
  ]));
  const reply = await ai.processMessage('Regarde le système puis note ma préférence');
  assert.equal(reply.executions?.[0].tool,'system_status'); assert.equal(store.read().notes.length,0);
  await ai.confirm(reply.pendingActions![0].id);
  assert.equal(store.read().notes[0].content,'Réponses en français');
  const bad = new JarvisAI({},store,scripted([{text:'',calls:[{name:'create_task',args:{title:'valid'}},{name:'save_note',args:{title:''}}]}]));
  await assert.rejects(bad.processMessage('bad fixture')); assert.equal(bad.listActions().length,0);
});
test('conversation and saved notes actually enter the provider context', async () => {
  const store=new LocalStore();store.update(state=>{state.settings={provider:'local',model:'fixture'};state.notes.push({id:'n',title:'Préférence',content:'Préfère TypeScript',created_at:new Date().toISOString()});});
  const factory = (() => ({turn:async(system:string,messages:any[])=>{assert.match(system,/Préfère TypeScript/);assert.ok(messages.some(message=>message.content==='Question précédente'));return{text:'Contexte pris en compte.',calls:[]};}})) as typeof createProvider;
  const ai=new JarvisAI({},store,factory);await ai.saveMessage('Question précédente','user');assert.equal((await ai.processMessage('Et maintenant ?')).action,'assistant_reply');
});
test('HTTP rejects foreign origin/rebinding, validates inputs, confirms and persists workspace', async () => {
  const ai=new JarvisAI({}); const server=createApp(ai,{WEBHOOK_TOKEN:'test-only'}).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  try {
    const post=(route:string,body:unknown,extra:Record<string,string>={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
    assert.equal((await post('/api/chat',{message:'a'},{Origin:'https://evil.example'})).status,403);
    const rebound = await new Promise<number | undefined>((resolve,reject)=>{const request=httpRequest(base+'/api/health',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);request.end();});
    assert.equal(rebound,403);
    for(const message of [123,' ','x'.repeat(4001)])assert.equal((await post('/api/chat',{message})).status,400);
    assert.equal((await fetch(base+'/api/messages?limit=-1')).status,400);
    const reply=await(await post('/api/chat',{message:'Créer tâche Test'})).json() as {pendingActions:{id:string}[]};
    assert.equal((await post(`/api/actions/${reply.pendingActions[0].id}/confirm`,{})).status,200);
    assert.equal((await post(`/api/actions/${reply.pendingActions[0].id}/confirm`,{})).status,400);
    const workspace=await(await fetch(base+'/api/workspace')).json() as {tasks:unknown[]};assert.equal(workspace.tasks.length,1);
    assert.equal((await post('/api/webhook/notify',{event:'done'})).status,401);
    assert.equal((await post('/api/webhook/notify',{event:'done'},{Authorization:'Bearer test-only'})).status,200);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});

test('oversized later proposals do not leave partial pending groups',async()=>{
 const store=new LocalStore();store.update(state=>{state.settings={provider:'local',model:'fixture'};});
 const ai=new JarvisAI({},store,scripted([{text:'',calls:[{name:'create_task',args:{title:'valid'}},{name:'save_note',args:{title:'Large',content:'x'.repeat(9000)}}]}]));
 await assert.rejects(ai.processMessage('fixture'));assert.equal(ai.listActions().length,0);
});
test('confirmation expires and cannot be replayed',async()=>{
 const ai=new JarvisAI({});const reply=await ai.processMessage('Créer tâche Expiration');const id=reply.pendingActions![0].id;const original=Date.now;Date.now=()=>original()+6*60000;
 try{await assert.rejects(ai.confirm(id));assert.equal(ai.workspace().tasks.length,0);}finally{Date.now=original;}
});

test('forgetting a personal note is confirmed and removes only the selected entry',async()=>{
 const ai=new JarvisAI({});const proposed=await ai.processMessage('Créer une note Préférence de test');await ai.confirm(proposed.pendingActions![0].id);const id=ai.workspace().notes[0].id;const forget=await ai.processMessage(`Oublier note ${id}`);assert.equal(ai.workspace().notes.length,1);await ai.confirm(forget.pendingActions![0].id);assert.equal(ai.workspace().notes.length,0);await assert.rejects(ai.confirm(forget.pendingActions![0].id));
});

test('explicit memory commands remain usable with an unreachable configured model',async()=>{
 const store=new LocalStore();store.update(state=>{state.settings={provider:'local',model:'not-installed'};});const ai=new JarvisAI({},store,scripted([]));const reply=await ai.processMessage('Créer tâche Sans réseau');await ai.confirm(reply.pendingActions![0].id);assert.equal(ai.workspace().tasks[0].title,'Sans réseau');
});
