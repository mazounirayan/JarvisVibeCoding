import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, demoCommand, resolveDemoAction } from '../src/demo.ts';

test('demo creation requires confirmation and leaves the source snapshot intact', () => {
  const source = createDemo();
  const result = demoCommand(source, 'Créer tâche Publier la vidéo');
  assert.equal(result.workspace.tasks.length, source.workspace.tasks.length);
  assert.equal(result.pending.length, 1);
  const confirmed = resolveDemoAction(result, result.pending[0].id, true);
  assert.equal(confirmed.workspace.tasks.at(-1)?.title, 'Publier la vidéo');
  assert.equal(confirmed.pending.length, 0);
  assert.equal(source.pending.length, 0);
  assert.throws(() => resolveDemoAction(confirmed, result.pending[0].id, true));
});

test('cancelled and expired demo actions cannot mutate the workspace', () => {
  const source = demoCommand(createDemo(), 'Note : Une idée à garder');
  const cancelled = resolveDemoAction(source, source.pending[0].id, false);
  assert.equal(cancelled.workspace.notes.length, source.workspace.notes.length);
  source.pending[0].expires_at = '2000-01-01T00:00:00.000Z';
  assert.throws(() => resolveDemoAction(source, source.pending[0].id, true));
});

test('task completion and note removal operate only on known demo items', () => {
  const source = createDemo();
  const proposed = demoCommand(source, `Terminer tâche ${source.workspace.tasks[1].id}`);
  const done = resolveDemoAction(proposed, proposed.pending[0].id, true);
  assert.equal(done.workspace.tasks[1].status, 'completed');
  const removal = demoCommand(done, `Oublier note ${done.workspace.notes[0].id}`);
  assert.equal(resolveDemoAction(removal, removal.pending[0].id, true).workspace.notes.length, 0);
  assert.equal(demoCommand(source, 'Terminer tâche unknown').pending.length, 0);
});

test('demo reports simulated system data and does not invent model answers', () => {
  const source = createDemo();
  assert.match(demoCommand(source, 'État système').messages.at(-1)!.content, /simul/i);
  assert.match(demoCommand(source, 'Quel temps fait-il ?').messages.at(-1)!.content, /démonstration/i);
  assert.equal(demoCommand(source, 'Afficher les tâches').pending.length, 0);
});
