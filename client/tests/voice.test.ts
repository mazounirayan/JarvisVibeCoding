import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceController, WAKE_WORD_PATTERN } from '../src/services/voiceController.ts';
import { AudioEngine } from '../src/services/audioEngine.ts';
test('VoiceController initial state and environment support check', () => {
  // En environnement Node, window.SpeechRecognition n'est pas défini nativement
  assert.equal(typeof VoiceController.isSupported(), 'boolean');

  let state = 'idle';
  const controller = new VoiceController({
    silenceTimeoutMs: 1200,
    onStateChange: (s) => {
      state = s;
    },
  });

  assert.equal(state, 'idle');
  controller.stop();
  assert.equal(state, 'idle');
});

test('AudioEngine creates instance and handles volume safely without throwing', () => {
  const engine = new AudioEngine();
  assert.equal(engine.getAverageVolume(), 0);
  assert.deepEqual(engine.getFrequencyData(), new Uint8Array(0));
  // playChime ne lève pas d'exception même si AudioContext est manquant
  assert.doesNotThrow(() => engine.playChime('wake'));
  assert.doesNotThrow(() => engine.playChime('confirm'));
  assert.doesNotThrow(() => engine.playChime('cancel'));
});

test('Wake word pattern matches expected French and English Jarvis cues', () => {
  const wakeRegex = WAKE_WORD_PATTERN;
  assert.equal(wakeRegex.test('jarvis'), true);
  assert.equal(wakeRegex.test('Dis Jarvis quelle heure est-il'), true);
  assert.equal(wakeRegex.test('Hey Jarvis éteins la lumière'), true);
  assert.equal(wakeRegex.test('bonjour comment vas tu'), false);

  const phrase = 'Dis Jarvis affiche mes tâches';
  const match = phrase.match(wakeRegex);
  assert.notEqual(match, null);
  const remainder = phrase.slice(match!.index! + match![0].length).trim();
  assert.equal(remainder, 'affiche mes tâches');
});
