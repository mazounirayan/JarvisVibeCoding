import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import * as os from 'node:os';
import { LocalStore } from './state.js';

export interface ToolDeclaration { name: string; description: string; parameters: Record<string, unknown> }
export interface Capability { id: string; label: string; available: boolean; reason?: string }
const strings = (keys: string[]) => Object.fromEntries(keys.map(key => [key, { type: 'string' }]));
const declaration = (name: string, description: string, keys: string[] = []): ToolDeclaration => ({ name, description,
  parameters: { type: 'object', properties: strings(keys), required: keys, additionalProperties: false } });
const blocked = (name: string) => /^(\.|node_modules$|secrets?$|private$|credentials?$|\.ssh$|\.aws$)/i.test(name)
  || /\.(pem|key|p12|pfx|kdbx)$/i.test(name);
const inside = (root: string, path: string) => { const delta = relative(root, path); return delta === '' || (!isAbsolute(delta) && delta !== '..' && !delta.startsWith(`..${sep}`)); };
function parseRoots(raw?: string): string[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 20 || value.some(root => typeof root !== 'string' || !isAbsolute(root))) throw new Error('JARVIS_ALLOWED_DIRS must be an array of absolute directory paths');
  return value;
}
function parseApps(raw?: string): Record<string, string> {
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JARVIS_APPS must be an object');
  for (const [id, path] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof path !== 'string' || !isAbsolute(path)
      || (process.platform === 'win32' && !/\.exe$/i.test(path))) throw new Error('JARVIS_APPS requires application ids and absolute executable paths');
  }
  return value as Record<string, string>;
}
function argsObject(value: unknown, keys: string[], limits: Record<string, number> = {}): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be an object');
  const args = value as Record<string, unknown>;
  if (Object.keys(args).some(key => !keys.includes(key)) || keys.some(key => typeof args[key] !== 'string' || !(args[key] as string).trim() || (args[key] as string).length > (limits[key] ?? 200))) throw new Error('Invalid tool arguments');
  return Object.fromEntries(keys.map(key => [key, (args[key] as string).trim()]));
}

export class ToolRegistry {
  readonly declarations: ToolDeclaration[] = [
    declaration('list_tasks', 'List personal tasks'), declaration('create_task', 'Create a task after user confirmation', ['title']),
    declaration('complete_task', 'Complete a task by exact id after user confirmation', ['id']), declaration('list_notes', 'List personal notes'),
    declaration('save_note', 'Save a personal note after user confirmation', ['title', 'content']),
    declaration('delete_note', 'Forget a saved personal note by exact id after user confirmation', ['id']),
    declaration('system_status', 'Read actual operating system, uptime, memory and CPU information'),
    declaration('find_files', 'Find file names within configured allowed folders; never read contents', ['query']),
    declaration('open_app', 'Launch an allowlisted application id after user confirmation', ['id']),
    declaration('trigger_workflow', 'Trigger the one configured n8n workflow after user confirmation'),
    declaration('get_weather', 'Get weather conditions for a city', ['city']),
  ];
  private readonly roots: string[];
  private readonly apps: Record<string, string>;
  private readonly webhook?: string;
  constructor(private readonly store: LocalStore, env: NodeJS.ProcessEnv = {}) {
    this.roots = parseRoots(env.JARVIS_ALLOWED_DIRS);
    this.apps = parseApps(env.JARVIS_APPS);
    if (Object.keys(this.apps).length) {
      const appTool = this.declarations.find(tool => tool.name === 'open_app')!;
      appTool.parameters.properties = { id: { type: 'string', enum: Object.keys(this.apps) } };
    }
    if (env.N8N_WEBHOOK_URL) {
      const url = new URL(env.N8N_WEBHOOK_URL);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid N8N_WEBHOOK_URL');
      this.webhook = url.href;
    }
  }
  capabilities(): Capability[] {
    const labels: Record<string,string> = { list_tasks: 'Consulter vos tâches', create_task: 'Créer une tâche', complete_task: 'Terminer une tâche', list_notes: 'Consulter vos notes', save_note: 'Mémoriser une note', delete_note: 'Oublier une note', system_status: 'État du PC', find_files: 'Retrouver un fichier', open_app: 'Ouvrir une application', trigger_workflow: 'Lancer une automatisation', get_weather: 'Consulter la météo' };
    return this.declarations.map(tool => {
      const available = tool.name === 'find_files' ? this.roots.length > 0 : tool.name === 'open_app' ? Object.keys(this.apps).length > 0 : tool.name === 'trigger_workflow' ? !!this.webhook : true;
      return { id: tool.name, label: labels[tool.name] || tool.name, available, ...(!available ? { reason: 'À configurer' } : {}) };
    });
  }
  needsConfirmation(name: string): boolean { return ['create_task', 'complete_task', 'save_note', 'delete_note', 'open_app', 'trigger_workflow'].includes(name); }
  /** Validate proposed calls without launching applications, changing state or making requests. */
  validate(name: string, value: unknown): void {
    const tool = this.declarations.find(item => item.name === name);
    if (!tool) throw new Error('Unknown tool');
    const keys = tool.parameters.required as string[];
    const args = argsObject(value, keys, name === 'save_note' ? { content: 10000 } : {});
    if (name === 'complete_task' && !this.store.read().tasks.some(task => task.id === args.id)) throw new Error('Task not found');
    if (name === 'delete_note' && !this.store.read().notes.some(note => note.id === args.id)) throw new Error('Note not found');
    if (name === 'open_app' && !Object.hasOwn(this.apps, args.id)) throw new Error('Application is not allowlisted');
    if (name === 'trigger_workflow' && !this.webhook) throw new Error('Workflow is not configured');
    if (name === 'find_files' && !this.roots.length) throw new Error('File search is not configured');
  }
  async execute(name: string, value: unknown): Promise<unknown> {
    this.validate(name, value);
    switch (name) {
      case 'list_tasks': argsObject(value, []); return this.store.read().tasks;
      case 'list_notes': argsObject(value, []); return this.store.read().notes;
      case 'create_task': {
        const args = argsObject(value, ['title']);
        const task = { id: randomUUID(), title: args.title, status: 'pending' as const, created_at: new Date().toISOString() };
        this.store.update(state => { state.tasks.push(task); }); return task;
      }
      case 'complete_task': {
        const args = argsObject(value, ['id']);
        this.store.update(state => { const task = state.tasks.find(item => item.id === args.id); if (!task) throw new Error('Task not found'); task.status = 'completed'; });
        return this.store.read().tasks.find(item => item.id === args.id);
      }
      case 'save_note': {
        const args = argsObject(value, ['title', 'content'], { content: 10000 });
        const note = { id: randomUUID(), title: args.title, content: args.content, created_at: new Date().toISOString() };
        this.store.update(state => { state.notes.push(note); }); return note;
      }
      case 'delete_note': {
        const { id } = argsObject(value, ['id']);
        this.store.update(state => { state.notes = state.notes.filter(note => note.id !== id); });
        return { id, status: 'forgotten' };
      }
      case 'system_status': argsObject(value, []); return { platform: os.platform(), release: os.release(), hostname: os.hostname(), uptime_seconds: os.uptime(), memory: { total_bytes: os.totalmem(), free_bytes: os.freemem() }, cpu: { count: os.cpus().length, model: os.cpus()[0]?.model ?? null }, load_average: process.platform === 'win32' ? null : os.loadavg() };
      case 'find_files': return this.findFiles(argsObject(value, ['query']).query);
      case 'open_app': {
        const { id } = argsObject(value, ['id']);
        if (!Object.hasOwn(this.apps, id)) throw new Error('Application is not allowlisted');
        const path = this.apps[id];
        if (!(await lstat(path)).isFile()) throw new Error('Configured application is not a regular file');
        await new Promise<void>((resolve, reject) => {
          const child = spawn(path, [], { shell: false, stdio: 'ignore', windowsHide: true });
          child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
        });
        return { id, status: 'launch_accepted' };
      }
      case 'trigger_workflow': {
        argsObject(value, []); if (!this.webhook) throw new Error('Workflow is not configured');
        const response = await fetch(this.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'jarvis', requested_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000), redirect: 'error' });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Workflow request failed with status ${response.status}`);
        return { status: 'request_accepted', http_status: response.status };
      }
      case 'get_weather': {
        const { city } = argsObject(value, ['city']);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { signal: controller.signal });
          clearTimeout(timer);
          if (response.ok) {
            const data = (await response.json()) as { current_condition?: Array<{ temp_C?: string; weatherDesc?: Array<{ value?: string }>; humidity?: string; windspeedKmph?: string }> };
            const current = data.current_condition?.[0];
            if (current) {
              return {
                city,
                temperature: `${current.temp_C}°C`,
                condition: current.weatherDesc?.[0]?.value || 'Non spécifié',
                humidity: `${current.humidity}%`,
                wind: `${current.windspeedKmph} km/h`,
              };
            }
          }
        } catch {
          // Requête interrompue ou injoignable : signalé ci-dessous, jamais de données inventées.
        }
        throw new Error(`Météo indisponible : le service public n’a pas répondu pour « ${city} ».`);
      }
      default: throw new Error('Unknown tool');
    }
  }
  private async findFiles(query: string): Promise<unknown> {
    if (!this.roots.length) throw new Error('File search is not configured');
    const results: { name: string; path: string }[] = [];
    let scanned = 0;
    const walk = async (root: string, directory: string, depth: number): Promise<void> => {
      if (depth > 5 || scanned >= 5000 || results.length >= 30) return;
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (scanned >= 5000 || results.length >= 30) break;
        scanned++;
        if (blocked(entry.name) || entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        try {
          const stat = await lstat(path);
          if (stat.isSymbolicLink()) continue;
          const canonical = await realpath(path);
          if (!inside(root, canonical) || canonical !== path) continue;
          if (stat.isDirectory()) await walk(root, canonical, depth + 1);
          else if (stat.isFile() && entry.name.toLowerCase().includes(query.toLowerCase())) results.push({ name: entry.name, path: canonical });
        } catch { /* Inaccessible or concurrently removed entries are skipped. */ }
      }
    };
    for (const configured of this.roots) {
      try {
        if ((await lstat(configured)).isSymbolicLink()) continue;
        const root = await realpath(configured);
        if (!(await lstat(root)).isDirectory()) continue;
        await walk(root, root, 0);
      } catch { /* Inaccessible roots produce no results. */ }
    }
    return { files: results, scanned, limited: scanned >= 5000 || results.length >= 30 };
  }
}
