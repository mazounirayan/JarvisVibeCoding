import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createProvider } from '../src/providers.js';
test('Ollama adapter supplies history/tools and preserves raw tool calls in follow-up',async()=>{
  let calls=0;
  const server=createServer((req,res)=>{let text='';req.on('data',chunk=>text+=chunk);req.on('end',()=>{const body=JSON.parse(text);assert.equal(body.stream,false);assert.equal(body.model,'fixture');assert.equal(body.tools[0].function.name,'list_tasks');assert.equal(body.messages[0].role,'system');if(calls++)assert.equal(body.messages.at(-1).tool_name,'list_tasks');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:calls===1?{role:'assistant',content:'',tool_calls:[{function:{name:'list_tasks',arguments:{}}}]}:{role:'assistant',content:'Liste prête.'}}));});}).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  try{const provider=createProvider('local','fixture',{OLLAMA_BASE_URL:`http://127.0.0.1:${address.port}`});const tools=[{name:'list_tasks',description:'Liste',parameters:{type:'object',properties:{}}}];const first=await provider.turn('system',[{role:'user',content:'mes tâches'}],tools);assert.equal(first.calls[0].name,'list_tasks');const second=await provider.turn('system',[{role:'user',content:'mes tâches'},{role:'assistant',raw:first.raw},{role:'tool',toolName:'list_tasks',result:[]}],tools);assert.equal(second.text,'Liste prête.');}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('Gemini model configuration is required before a request',()=>{assert.throws(()=>createProvider('gemini','',{}));});

test('Gemini adapter preserves function-call metadata and sends tool responses',async()=>{
  const original=globalThis.fetch; const bodies:any[]=[];
  globalThis.fetch=async(_url:any,options?:RequestInit)=>{bodies.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({candidates:[{content:{parts:bodies.length===1?[{functionCall:{name:'list_tasks',args:{}},thoughtSignature:'fixture-signature'}]:[{text:'Résultat reçu.'}]}}]}),{status:200});};
  try{const provider=createProvider('gemini','fixture',{GEMINI_API_KEY:'test-only'});const tools=[{name:'list_tasks',description:'Liste',parameters:{type:'object',properties:{}}}];const first=await provider.turn('system',[{role:'user',content:'tâches'}],tools);assert.equal(first.calls[0].name,'list_tasks');assert.equal(bodies[0].tools[0].functionDeclarations[0].parametersJsonSchema.type,'object');await provider.turn('system',[{role:'user',content:'tâches'},{role:'assistant',raw:first.raw},{role:'tool',toolName:'list_tasks',result:[]}],tools);assert.equal(bodies[1].contents[1].parts[0].thoughtSignature,'fixture-signature');assert.deepEqual(bodies[1].contents[2].parts[0].functionResponse.response.result,[]);}finally{globalThis.fetch=original;}
});
