import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Message { id: string; content: string; sender: 'user' | 'jarvis'; created_at: string }
export interface Task { id: string; title: string; status: 'pending' | 'completed'; created_at: string }
export interface Note { id: string; title: string; content: string; created_at: string }
export interface State {
  messages: Message[]; tasks: Task[]; notes: Note[];
  settings: { provider: 'local' | 'gemini'; model: string };
  preferences?: Record<string, unknown>;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function validate(value: unknown): asserts value is State {
  if (!record(value) || !Array.isArray(value.messages) || !Array.isArray(value.tasks) || !Array.isArray(value.notes)
    || !record(value.settings) || !['local', 'gemini'].includes(String(value.settings.provider))
    || typeof value.settings.model !== 'string' || (value.preferences !== undefined && !record(value.preferences))) throw new Error('Invalid local state; existing file was preserved');
  for (const [items, kind] of [[value.messages, 'message'], [value.tasks, 'task'], [value.notes, 'note']] as const) {
    const ids = new Set<string>();
    for (const item of items) {
      if (!record(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)
        || typeof item.created_at !== 'string' || !Number.isFinite(Date.parse(item.created_at))
        || (kind === 'message' && (typeof item.content !== 'string' || !['user', 'jarvis'].includes(String(item.sender))))
        || (kind === 'task' && (typeof item.title !== 'string' || !['pending', 'completed'].includes(String(item.status))))
        || (kind === 'note' && (typeof item.title !== 'string' || typeof item.content !== 'string'))) throw new Error('Invalid local state; existing file was preserved');
      ids.add(item.id);
    }
  }
}

/** Memory by default; disk updates are committed before the in-memory snapshot changes. */
export class LocalStore {
  private state: State = { messages: [], tasks: [], notes: [], settings: { provider: 'local', model: '' } };
  private readonly file?: string;
  constructor(directory?: string) {
    if (directory === undefined) return;
    this.file = join(directory, 'state.json');
    if (existsSync(this.file)) {
      let loaded: unknown;
      try { loaded = JSON.parse(readFileSync(this.file, 'utf8')); } catch { throw new Error('Cannot read local state; existing file was preserved'); }
      validate(loaded);
      this.state = structuredClone(loaded);
      this.state.messages = this.state.messages.slice(-500);
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { chmodSync(directory, 0o700); if (existsSync(this.file)) chmodSync(this.file, 0o600); } catch { /* Windows ACLs may not support POSIX modes. */ }
  }
  read(): State { return structuredClone(this.state); }
  update(fn: (draft: State) => void): void {
    const draft = this.read();
    fn(draft);
    validate(draft);
    draft.messages = draft.messages.slice(-500);
    const committed = structuredClone(draft);
    // Serialization may fail (for example, cyclic preferences); do it before any writes.
    const serialized = JSON.stringify(draft);
    if (this.file) {
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        renameSync(temporary, this.file);
      } catch (error) {
        try { unlinkSync(temporary); } catch { /* No temporary file remains. */ }
        throw error;
      }
    }
    this.state = committed;
  }
}
