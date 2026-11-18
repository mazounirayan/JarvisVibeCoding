import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  start() { this.started++; FakeRecognition.instances.push(this); }
  stop() { this.stopped++; }
  abort() { this.aborted++; }
}

test('disabling wake word mode actually stops background recognition', async () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { SpeechRecognition: FakeRecognition };
  try {
    const { VoiceController } = await import('../src/services/voiceController.ts');
    const states: string[] = [];
    const controller = new VoiceController({ onStateChange: (state) => states.push(state) });

    controller.setWakeWordMode(true);
    const instance = FakeRecognition.instances.at(-1);
    assert.ok(instance, 'une reconnaissance doit être démarrée');
    assert.equal(instance.continuous, true);
    assert.ok(instance.started > 0);
    instance.onstart?.();
    assert.ok(states.includes('wake_waiting'), `états: ${states.join(',')}`);

    controller.setWakeWordMode(false);
    // Régression : avant correction, la reconnaissance n'était jamais arrêtée et
    // le micro restait actif en arrière-plan après la désactivation.
    assert.ok(instance.stopped > 0, 'la reconnaissance doit recevoir stop() quand on coupe le mode');
    instance.onend?.();
    assert.equal(states.at(-1), 'idle', `états: ${states.join(',')}`);
    controller.stop();
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
    FakeRecognition.instances = [];
  }
});

test('shared wake word pattern matches French cues and extracts the remainder', async () => {
  const { WAKE_WORD_PATTERN } = await import('../src/services/voiceController.ts');
  assert.equal(WAKE_WORD_PATTERN.test('jarvis'), true);
  assert.equal(WAKE_WORD_PATTERN.test('Dis Jarvis quelle heure est-il'), true);
  assert.equal(WAKE_WORD_PATTERN.test('Hey Jarvis éteins la lumière'), true);
  assert.equal(WAKE_WORD_PATTERN.test('bonjour comment vas tu'), false);
  const phrase = 'Dis Jarvis affiche mes tâches';
  const match = phrase.match(WAKE_WORD_PATTERN);
  assert.notEqual(match, null);
  const remainder = phrase.slice(match!.index! + match![0].length).trim();
  assert.equal(remainder, 'affiche mes tâches');
});
