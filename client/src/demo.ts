import type { Health, Message, PendingAction, Workspace } from './types';
export interface Demo { messages: Message[]; pending: PendingAction[]; workspace: Workspace }
const message = (content: string, sender: Message['sender'] = 'jarvis'): Message => ({ id: crypto.randomUUID(), content, sender, created_at: new Date().toISOString() });
export const demoHealth: Health = { status: 'demo', storage: 'memory', provider: { provider: 'local', model: 'Scénario interactif', configured: false }, capabilities: [
  { id: 'tasks', label: 'Tâches & notes', available: true }, { id: 'voice', label: 'Voix du navigateur', available: true }, { id: 'system', label: 'Système simulé', available: true }, { id: 'apps', label: 'Applications PC', available: false, reason: 'Disponible en session réelle' }
] };
export function createDemo(): Demo {
  const now = new Date().toISOString();
  return { pending: [], messages: [
    message('Jarvis, aide-moi à préparer le lancement de mon projet.', 'user'),
    message('On commence par ce qui compte.\n\nVotre espace de démonstration est prêt : deux tâches à terminer, une idée à garder et une session de concentration à lancer.\n\nEssayez « Créer tâche Publier la démo ». Je vous demanderai confirmation avant de l’ajouter.')
  ], workspace: { settings: { provider: 'local', model: '' }, tasks: [
    { id: 'demo-story', title: 'Préparer le fil de la démonstration', status: 'completed', created_at: now },
    { id: 'demo-video', title: 'Enregistrer une démo de 30 secondes', status: 'pending', created_at: now },
    { id: 'demo-launch', title: 'Partager le projet avec les builders', status: 'pending', created_at: now }
  ], notes: [{ id: 'demo-note', title: 'L’idée à retenir', content: 'Une intelligence personnelle qui transforme une intention en action. Toujours avec votre accord.', created_at: now }] } };
}
export function demoCommand(source: Demo, input: string): Demo {
  const next = structuredClone(source);
  next.messages.push(message(input, 'user'));
  let reply = '';
  const task = input.match(/^créer (?:une )?tâche\s+(.+)/i);
  const note = input.match(/^(?:note\s*:?|créer (?:une )?note)\s+(.+)/i);
  const done = input.match(/^terminer tâche\s+(.+)/i);
  const remove = input.match(/^oublier note\s+(.+)/i);
  const propose = (tool: string, label: string, args: Record<string, unknown>) => {
    next.pending.push({ id: crypto.randomUUID(), tool, label, args, expires_at: new Date(Date.now() + 300000).toISOString() });
    reply = `J’ai préparé l’action « ${label} ».\nValidez-la dans votre espace pour l’exécuter dans cette démonstration.`;
  };
  if (task) propose('create_task', 'Créer une tâche', { title: task[1] });
  else if (note) propose('create_note', 'Mémoriser une idée', { title: note[1].slice(0, 60), content: note[1] });
  else if (done && next.workspace.tasks.some(t => t.id === done[1] && t.status !== 'completed')) propose('complete_task', 'Terminer une tâche', { id: done[1] });
  else if (remove && next.workspace.notes.some(n => n.id === remove[1])) propose('delete_note', 'Retirer une note', { id: remove[1] });
  else if (/afficher les tâches/i.test(input)) reply = next.workspace.tasks.map(t => `${t.status === 'completed' ? '✓' : '○'} ${t.title}`).join('\n') || 'Aucune tâche dans cette démonstration.';
  else if (/afficher les notes/i.test(input)) reply = next.workspace.notes.map(n => `${n.title}\n${n.content}`).join('\n\n') || 'Aucune note dans cette démonstration.';
  else if (/état système/i.test(input)) reply = 'Aperçu simulé\n\nLe mode démo ne consulte pas votre ordinateur. En session réelle, cette commande affiche les informations renvoyées par votre serveur local.\n\nLes tâches et les notes de cet espace restent dans cette session de démonstration.';
  else reply = 'Vous êtes dans un scénario de démonstration, sans modèle IA connecté.\n\nEssayez « Créer tâche … », « Note : … », « Afficher les tâches » ou « État système ». Pour une conversation libre, passez en session réelle et configurez Ollama ou Gemini dans les réglages.';
  next.messages.push(message(reply));
  return next;
}
export function resolveDemoAction(source: Demo, id: string, confirm: boolean): Demo {
  const next = structuredClone(source);
  const action = next.pending.find(a => a.id === id);
  if (!action || (confirm && Date.parse(action.expires_at) <= Date.now())) throw new Error('Cette action a expiré ou a déjà été traitée.');
  next.pending = next.pending.filter(a => a.id !== id);
  if (confirm) {
    const now = new Date().toISOString();
    if (action.tool === 'create_task') next.workspace.tasks.push({ id: crypto.randomUUID(), title: String(action.args.title), status: 'pending', created_at: now });
    if (action.tool === 'create_note') next.workspace.notes.push({ id: crypto.randomUUID(), title: String(action.args.title), content: String(action.args.content), created_at: now });
    if (action.tool === 'complete_task') next.workspace.tasks = next.workspace.tasks.map(t => t.id === action.args.id ? { ...t, status: 'completed' } : t);
    if (action.tool === 'delete_note') next.workspace.notes = next.workspace.notes.filter(n => n.id !== action.args.id);
  }
  next.messages.push(message(confirm ? 'Action confirmée. Votre espace de démonstration est à jour.' : 'Action annulée. Votre espace reste inchangé.'));
  return next;
}
