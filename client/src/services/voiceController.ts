import { defaultAudioEngine } from './audioEngine';

export interface VoiceControllerOptions {
  lang?: string;
  silenceTimeoutMs?: number;
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onCommandReady?: (command: string) => void;
  onWakeWordDetected?: () => void;
  onSilenceCountdown?: (progress: number) => void; // 0 to 1 (1 = timer completed)
  onStateChange?: (state: 'idle' | 'listening' | 'wake_waiting' | 'thinking') => void;
  onError?: (errorMessage: string) => void;
}

interface WebSpeechEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string };
    };
  };
}

interface WebSpeechErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: WebSpeechEvent) => void) | null;
  onerror: ((event: WebSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}

const SpeechRecognitionClass: (new () => SpeechRecognitionInstance) | undefined =
  typeof window !== 'undefined'
    ? (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition
    : undefined;

/** Mot-clé reconnu en mode mains libres : « Jarvis », « Dis Jarvis » ou « Hey Jarvis ». */
export const WAKE_WORD_PATTERN = /\b(?:dis\s+|hey\s+)?jarvis\b/i;

export class VoiceController {
  private recognition: SpeechRecognitionInstance | null = null;
  private options: Required<VoiceControllerOptions>;
  private isRunning = false;
  private isUserStopped = true;
  private isCancelled = false;
  private isWakeWordMode = false;
  private isWakeActive = false; // Wake word detected, now capturing prompt
  private finalTranscript = '';
  private currentInterim = '';
  private silenceTimer: number | null = null;
  private countdownInterval: number | null = null;
  private restartTimer: number | null = null;
  private isAssistantSpeaking = false;

  constructor(options: VoiceControllerOptions = {}) {
    this.options = {
      lang: options.lang || 'fr-FR',
      silenceTimeoutMs: options.silenceTimeoutMs ?? 1500,
      onTranscriptUpdate: options.onTranscriptUpdate || (() => {}),
      onCommandReady: options.onCommandReady || (() => {}),
      onWakeWordDetected: options.onWakeWordDetected || (() => {}),
      onSilenceCountdown: options.onSilenceCountdown || (() => {}),
      onStateChange: options.onStateChange || (() => {}),
      onError: options.onError || (() => {}),
    };
  }

  static isSupported(): boolean {
    return Boolean(SpeechRecognitionClass);
  }

  setAssistantSpeaking(speaking: boolean): void {
    this.isAssistantSpeaking = speaking;
    // Si Jarvis commence à parler et qu'on était en attente, on ne s'auto-écoute pas
    if (speaking && this.isWakeWordMode && !this.isWakeActive) {
      this.clearSilenceTimers();
    }
  }

  setWakeWordMode(enabled: boolean): void {
    const previous = this.isWakeWordMode;
    this.isWakeWordMode = enabled;
    if (enabled && !this.isRunning) {
      this.startContinuous();
    } else if (!enabled && previous) {
      // Couper réellement la reconnaissance : le micro ne doit pas rester actif.
      this.stop();
    }
  }

  startContinuous(): void {
    if (!SpeechRecognitionClass) {
      this.options.onError('La reconnaissance vocale n’est pas supportée dans ce navigateur.');
      return;
    }
    this.isUserStopped = false;
    this.isCancelled = false;
    this.isWakeActive = false;
    this.finalTranscript = '';
    this.currentInterim = '';
    this.options.onStateChange('wake_waiting');
    this.bootRecognition(true);
  }

  startDictation(): void {
    if (!SpeechRecognitionClass) {
      this.options.onError('La reconnaissance vocale n’est pas supportée dans ce navigateur.');
      return;
    }
    this.isUserStopped = false;
    this.isCancelled = false;
    this.isWakeActive = true;
    this.finalTranscript = '';
    this.currentInterim = '';
    defaultAudioEngine.playChime('listen');
    this.options.onStateChange('listening');
    this.bootRecognition(true);
  }

  stop(): void {
    this.isUserStopped = true;
    this.clearSilenceTimers();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignoré
      }
    }
    this.isRunning = false;
    this.isWakeActive = false;
    this.options.onStateChange('idle');
  }

  cancel(): void {
    this.isCancelled = true;
    this.clearSilenceTimers();
    defaultAudioEngine.playChime('cancel');
    this.finalTranscript = '';
    this.currentInterim = '';
    this.options.onTranscriptUpdate('', true);
    this.options.onSilenceCountdown(0);
    this.stop();
  }

  confirmNow(): void {
    const text = (this.finalTranscript + ' ' + this.currentInterim).trim();
    if (text) {
      this.clearSilenceTimers();
      defaultAudioEngine.playChime('confirm');
      this.options.onCommandReady(text);
      this.finalTranscript = '';
      this.currentInterim = '';
      this.options.onTranscriptUpdate('', true);
      this.options.onSilenceCountdown(0);
      if (this.isWakeWordMode) {
        this.isWakeActive = false;
        this.options.onStateChange('wake_waiting');
      } else {
        this.stop();
      }
    }
  }

  private bootRecognition(continuous: boolean): void {
    if (!SpeechRecognitionClass) return;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignoré
      }
    }

    const instance = new SpeechRecognitionClass();
    this.recognition = instance;
    instance.continuous = continuous;
    instance.interimResults = true;
    instance.lang = this.options.lang;

    instance.onstart = () => {
      this.isRunning = true;
      void defaultAudioEngine.startMic();
    };

    instance.onresult = (event: WebSpeechEvent) => {
      // Ignorer si Jarvis est en train de parler et que c'est un résidu audio
      if (this.isAssistantSpeaking) {
        // Détection de barge-in : si l'utilisateur parle fort alors que Jarvis parle
        return;
      }

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item[0].transcript;
        if (item.isFinal) {
          this.finalTranscript += ' ' + text;
        } else {
          interim += text;
        }
      }
      this.currentInterim = interim;
      const fullText = (this.finalTranscript + ' ' + this.currentInterim).trim();

      // En mode attente du mot-clé : tester si "Jarvis", "Dis Jarvis" ou "Hey Jarvis" est prononcé
      if (this.isWakeWordMode && !this.isWakeActive) {
        const match = fullText.match(WAKE_WORD_PATTERN);
        if (match && match.index !== undefined) {
          this.isWakeActive = true;
          defaultAudioEngine.playChime('wake');
          this.options.onWakeWordDetected();
          this.options.onStateChange('listening');

          // Extraire ce qui a été dit après le mot-clé
          const afterWake = fullText.slice(match.index + match[0].length).trim();
          this.finalTranscript = afterWake;
          this.currentInterim = '';
          this.options.onTranscriptUpdate(afterWake, false);

          if (afterWake) {
            this.triggerSilenceDebounce();
          }
          return;
        }
        return; // Attente passive
      }

      // En mode écoute active (dictée ou suite de mot de réveil)
      if (fullText) {
        this.options.onTranscriptUpdate(fullText, false);
        this.triggerSilenceDebounce();
      }
    };

    instance.onerror = (event: WebSpeechErrorEvent) => {
      if (event.error === 'no-speech') {
        // Silence normal, on continue si en continu
        return;
      }
      if (event.error === 'not-allowed') {
        this.isUserStopped = true;
        this.options.onError('Accès au microphone refusé. Activez-le dans votre navigateur.');
        this.options.onStateChange('idle');
        return;
      }
      if (event.error === 'network') {
        this.options.onError('Service de reconnaissance réseau indisponible. Vérifiez votre connexion.');
        return;
      }
      if (event.error === 'aborted') {
        return;
      }
      this.options.onError(`Erreur vocale : ${event.error}`);
    };

    instance.onend = () => {
      this.isRunning = false;

      // Si l'utilisateur n'a pas arrêté manuellement, redémarrer
      if (!this.isUserStopped && !this.isCancelled) {
        this.restartTimer = window.setTimeout(() => {
          try {
            this.bootRecognition(true);
          } catch {
            // Ignoré
          }
        }, 150);
      } else {
        this.options.onStateChange('idle');
      }
    };

    try {
      instance.start();
    } catch {
      this.isRunning = false;
    }
  }

  private triggerSilenceDebounce(): void {
    this.clearSilenceTimers();

    const startTime = Date.now();
    const duration = this.options.silenceTimeoutMs;

    this.countdownInterval = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      this.options.onSilenceCountdown(progress);
    }, 50);

    this.silenceTimer = window.setTimeout(() => {
      this.confirmNow();
    }, duration);
  }

  private clearSilenceTimers(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.options.onSilenceCountdown(0);
  }
}
