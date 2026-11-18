import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from '../src/state.js';
import { ToolRegistry } from '../src/tools.js';

test('local store persists tasks, notes and settings without exposing mutable snapshots', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jarvis-state-'));
  try {
    const store = new LocalStore(directory);
    const tools = new ToolRegistry(store);
    const task = await tools.execute('create_task', { title: 'Prepare demo' }) as { id: string };
    await tools.execute('complete_task', { id: task.id });
    await tools.execute('save_note', { title: 'Demo', content: 'Use local provider' });
    store.update(state => { state.settings = { provider: 'gemini', model: 'test-model' }; });
    const restored = new LocalStore(directory).read();
    assert.equal(restored.tasks[0].status, 'completed');
    assert.equal(restored.notes[0].content, 'Use local provider');
    assert.equal(restored.settings.provider, 'gemini');
    restored.tasks.length = 0;
    assert.equal(store.read().tasks.length, 1);
    assert.equal(new LocalStore().read().tasks.length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('corrupt state is preserved and failed writes never partially update memory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jarvis-corrupt-'));
  try {
    const path = join(directory, 'state.json');
    writeFileSync(path, '{broken');
    assert.throws(() => new LocalStore(directory), /preserved/);
    assert.equal(readFileSync(path, 'utf8'), '{broken');
    writeFileSync(path, JSON.stringify({ messages: [], tasks: [{ id: 'bad' }], notes: [], settings: { provider: 'local', model: 'x' } }));
    assert.throws(() => new LocalStore(directory), /preserved/);
    rmSync(path);
    const store = new LocalStore(directory);
    assert.throws(() => store.update(state => { state.settings.model = 'changed'; throw new Error('abort'); }), /abort/);
    assert.equal(store.read().settings.model, '');
    mkdirSync(path);
    assert.throws(() => store.update(state => { state.settings.model = 'changed'; }));
    assert.equal(store.read().settings.model, '');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('history remains bounded and invalid tool arguments never mutate state', async () => {
  const store = new LocalStore();
  store.update(state => { state.messages = Array.from({ length: 520 }, (_, i) => ({ id: String(i), content: String(i), sender: 'user', created_at: new Date().toISOString() })); });
  assert.equal(store.read().messages.length, 500);
  assert.equal(store.read().messages[0].id, '20');
  const tools = new ToolRegistry(store);
  tools.validate('create_task', { title: 'Preview only' });
  assert.equal(store.read().tasks.length, 0);
  assert.throws(() => tools.validate('create_task', { title: 42 }), /arguments/);
  assert.throws(() => tools.validate('open_app', { id: 'missing' }), /allowlisted/);
  for (const args of [null, [], { title: '' }, { title: 12 }, { title: 'x', command: 'anything' }, { title: 'x'.repeat(201) }]) {
    await assert.rejects(tools.execute('create_task', args), /arguments/);
  }
  await assert.rejects(tools.execute('complete_task', { id: 'unknown' }), /not found/);
  await assert.rejects(tools.execute('open_app', { id: '__proto__' }), /allowlisted/);
  await assert.rejects(tools.execute('arbitrary_shell', {}), /Unknown tool/);
  assert.equal(store.read().tasks.length, 0);
  assert.ok(tools.needsConfirmation('save_note'));
  assert.ok(tools.needsConfirmation('trigger_workflow'));
  assert.equal(tools.needsConfirmation('system_status'), false);
  const status = await tools.execute('system_status', {}) as { memory: { total_bytes: number }; load_average: unknown };
  assert.ok(status.memory.total_bytes > 0);
  if (process.platform === 'win32') assert.equal(status.load_average, null);
});

test('file search confines names to allowed roots and skips private folders and links', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jarvis-search-'));
  try {
    const allowed = join(directory, 'allowed'); const outside = join(directory, 'outside');
    mkdirSync(allowed); mkdirSync(outside);
    writeFileSync(join(allowed, 'report.txt'), 'contents never returned');
    writeFileSync(join(outside, 'report-secret.txt'), 'secret');
    for (const name of ['.git', 'node_modules', 'private']) { mkdirSync(join(allowed, name)); writeFileSync(join(allowed, name, 'report.txt'), 'secret'); }
    writeFileSync(join(allowed, '.env'), 'secret');
    symlinkSync(outside, join(allowed, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const tools = new ToolRegistry(new LocalStore(), { JARVIS_ALLOWED_DIRS: JSON.stringify([allowed]) });
    const result = await tools.execute('find_files', { query: 'report' }) as { files: { name: string; path: string }[] };
    assert.deepEqual(result.files.map(file => file.name), ['report.txt']);
    assert.equal(JSON.stringify(result).includes('contents never returned'), false);
    assert.throws(() => new ToolRegistry(new LocalStore(), { JARVIS_ALLOWED_DIRS: '["relative"]' }), /absolute/);
    assert.throws(() => new ToolRegistry(new LocalStore(), { JARVIS_APPS: '{"bad":"relative"}' }), /absolute/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('configured application ids are advertised precisely and launch without shell commands',async()=>{
 const registry=new ToolRegistry(new LocalStore(),{JARVIS_APPS:JSON.stringify({probe:process.execPath})});
 assert.deepEqual((registry.declarations.find(tool=>tool.name==='open_app')!.parameters.properties as any).id.enum,['probe']);
 assert.equal(registry.needsConfirmation('open_app'),true);
 const result=await registry.execute('open_app',{id:'probe'}) as {status:string};assert.equal(result.status,'launch_accepted');
});

test('weather tool reports unavailability instead of inventing conditions',async()=>{
 const tools=new ToolRegistry(new LocalStore());
 const original=globalThis.fetch;
 globalThis.fetch=(async()=>{throw new Error('réseau simulé indisponible');}) as typeof fetch;
 try{
   await assert.rejects(tools.execute('get_weather',{city:'Paris'}),/Météo indisponible/);
 }finally{globalThis.fetch=original;}
});
