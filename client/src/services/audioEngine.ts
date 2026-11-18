/**
 * Moteur Web Audio pour Jarvis :
 * - Analyse fréquentielle FFT en temps réel (micro & audio)
 * - Synthèse sonore procédurale pour effets sonores HUD (sans aucun fichier externe)
 */

export type ChimeType = 'wake' | 'listen' | 'confirm' | 'cancel' | 'error';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private freqData: Uint8Array | null = null;
  private isMicActive = false;

  private getAudioContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  async startMic(): Promise<boolean> {
    try {
      if (this.isMicActive && this.analyser) return true;
      const ctx = this.getAudioContext();
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.75;

      this.source = ctx.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.isMicActive = true;
      return true;
    } catch {
      // Le refus ou l'absence de micro est déjà remonté à l'interface via la reconnaissance.
      this.isMicActive = false;
      return false;
    }
  }

  stopMic(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // Ignoré
      }
      this.source = null;
    }
    this.isMicActive = false;
  }

  getFrequencyData(): Uint8Array {
    if (this.analyser && this.freqData && this.isMicActive) {
      this.analyser.getByteFrequencyData(this.freqData);
      return this.freqData;
    }
    return new Uint8Array(0);
  }

  getAverageVolume(): number {
    const data = this.getFrequencyData();
    if (!data.length) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum / data.length / 255;
  }

  /**
   * Synthétise un effet sonore HUD futuriste et discret
   */
  playChime(type: ChimeType, volume = 0.12): void {
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(volume, now);
      masterGain.connect(ctx.destination);

      switch (type) {
        case 'wake': {
          // Double-bip ascendant distinctif type "Jarvis activé"
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          const gain2 = ctx.createGain();

          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(440, now); // A4
          osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

          gain1.gain.setValueAtTime(0, now);
          gain1.gain.linearRampToValueAtTime(0.7, now + 0.02);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(880, now + 0.1);
          osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.25); // A6

          gain2.gain.setValueAtTime(0, now + 0.1);
          gain2.gain.linearRampToValueAtTime(0.5, now + 0.13);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

          osc1.connect(gain1);
          gain1.connect(masterGain);
          osc2.connect(gain2);
          gain2.connect(masterGain);

          osc1.start(now);
          osc1.stop(now + 0.2);
          osc2.start(now + 0.1);
          osc2.stop(now + 0.35);
          break;
        }

        case 'listen': {
          // Bip doux pour signaler le début d'écoute
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(659.25, now); // E5
          osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.1); // B5

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        }

        case 'confirm': {
          // Son feutré d'action confirmée (accord majeur ascendant)
          const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
          freqs.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.05);

            gain.gain.setValueAtTime(0, now + idx * 0.05);
            gain.gain.linearRampToValueAtTime(0.4, now + idx * 0.05 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.22);
          });
          break;
        }

        case 'cancel': {
          // Bip descendant d'annulation
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.exponentialRampToValueAtTime(293.66, now + 0.12); // D4

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.18);
          break;
        }

        case 'error': {
          // Bip d'erreur court à deux tons
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(220, now);

          gain1.gain.setValueAtTime(0, now);
          gain1.gain.linearRampToValueAtTime(0.3, now + 0.02);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

          osc1.connect(gain1);
          gain1.connect(masterGain);
          osc1.start(now);
          osc1.stop(now + 0.22);
          break;
        }
      }
    } catch {
      // AudioContext peut être restreint avant interaction utilisateur
    }
  }
}

export const defaultAudioEngine = new AudioEngine();
