export interface Message { id: string; content: string; sender: 'user' | 'jarvis'; created_at: string }
export interface PendingAction { id: string; tool: string; label: string; args: Record<string, unknown>; expires_at: string }
export interface Health { status: string; storage: string; provider: { provider: 'local' | 'gemini'; model: string; configured: boolean }; capabilities: { id: string; label: string; available: boolean; reason?: string }[] }
export interface Workspace { tasks: { id: string; title: string; status: string; created_at: string }[]; notes: { id: string; title: string; content: string; created_at: string }[]; settings: { provider: 'local' | 'gemini'; model: string } }
