import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  ArrowUp,
  Check,
  ChevronRight,
  Cpu,
  FileText,
  ListTodo,
  Mic,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Square,
  Volume2,
  X,
  Command,
  Download,
  Expand,
  Shrink,
  Sparkles,
  ArrowUpRight,
  Radio,
  Plus,
  MessageSquare,
  Play,
  RotateCcw,
} from 'lucide-react';
import ChatMessage from './components/ChatMessage';
import NeuralCore from './components/NeuralCore';
import FocusTimer from './components/FocusTimer';
import CommandPalette from './components/CommandPalette';
import { createDemo, demoCommand, demoHealth, resolveDemoAction, type Demo } from './demo';
import { defaultAudioEngine } from './services/audioEngine';
import { VoiceController } from './services/voiceController';
import type { Message, PendingAction, Health, Workspace } from './types';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
/** Build statique en ligne (GitHub Pages) : démarre en démo, sans serveur ni session réelle. */
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';
const suggestions = ['Afficher les tâches', 'État système', 'Note Préparer ma prochaine démonstration'];
const initialWorkspace: Workspace = { tasks: [], notes: [], settings: { provider: 'local', model: '' } };

export default function App() {
  const [demo, setDemo] = useState(() => STATIC_DEMO || new URLSearchParams(window.location.search).has('demo'));
  const demoData = useRef<Demo>(createDemo());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState('all');
  const [clock, setClock] = useState(new Date());
  const [messages, setMessages] = useState<Message[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');

  // États vocaux avancés
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'wake_waiting' | 'thinking'>('idle');
  const [wakeWordMode, setWakeWordMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [fftBars, setFftBars] = useState<number[]>([6, 8, 12, 16, 14, 18, 12, 9, 6]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<'local' | 'gemini'>('local');
  const [model, setModel] = useState('');
  const [notice, setNotice] = useState('');

  const end = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const refreshLock = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const voicePreference = useRef({ enabled: false, uri: '' });
  voicePreference.current = { enabled: voiceEnabled, uri: selectedVoice };

  const voiceController = useRef<VoiceController | null>(null);

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    if (demo) {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (path === '/api/chat') {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        demoData.current = demoCommand(demoData.current, body.message);
        const result = demoData.current;
        return { message: result.messages[result.messages.length - 1]?.content, pendingActions: result.pending } as T;
      }
      const action = path.match(/^\/api\/actions\/([^/]+)\/(confirm|cancel)$/);
      if (action) {
        demoData.current = resolveDemoAction(demoData.current, decodeURIComponent(action[1]), action[2] === 'confirm');
        return { message: demoData.current.messages[demoData.current.messages.length - 1]?.content } as T;
      }
      if (path === '/api/health') return demoHealth as T;
      if (path === '/api/messages') return demoData.current.messages as T;
      if (path === '/api/actions') return demoData.current.pending as T;
      if (path === '/api/workspace') return demoData.current.workspace as T;
      throw new Error('Les réglages du moteur se modifient en session réelle.');
    }
    const controller = new AbortController();
    controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), path === '/api/chat' ? 300000 : 15000);
    try {
      const response = await fetch(`${API_URL}${path}`, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Erreur HTTP ${response.status}`);
      return data as T;
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'AbortError')
        throw new Error('La requête a été interrompue ou a dépassé le délai. Actualisez avant de réessayer.');
      throw failure;
    } finally {
      clearTimeout(timeout);
      controllers.current.delete(controller);
    }
  }

  const json = (body: unknown, method = 'POST'): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  async function refresh() {
    if (refreshLock.current || lock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      const [nextHealth, history, actions, nextWorkspace] = await Promise.all([
        request<Health>('/api/health'),
        request<Message[]>('/api/messages'),
        request<PendingAction[]>('/api/actions'),
        request<Workspace>('/api/workspace'),
      ]);
      if (!mounted.current) return;
      setHealth(nextHealth);
      setMessages(history);
      setPending(actions);
      setWorkspace(nextWorkspace);
      setProvider(nextWorkspace.settings.provider);
      setModel(nextWorkspace.settings.model);
      setError('');
    } catch (failure) {
      if (mounted.current) {
        setHealth(null);
        setError(failure instanceof Error ? failure.message : 'Connexion au serveur indisponible.');
      }
    } finally {
      refreshLock.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }

  // Initialisation du contrôleur vocal
  useEffect(() => {
    voiceController.current = new VoiceController({
      lang: 'fr-FR',
      silenceTimeoutMs: 1500,
      onTranscriptUpdate: (text) => {
        if (mounted.current) {
          setDraft(text);
          setVoiceError('');
        }
      },
      onCommandReady: (command) => {
        if (mounted.current && command.trim()) {
          send(command.trim());
        }
      },
      onWakeWordDetected: () => {
        if (mounted.current) {
          stopSpeech(); // Barge-in si Jarvis parlait
          setVoiceError('');
        }
      },
      onSilenceCountdown: (progress) => {
        if (mounted.current) {
          setSilenceProgress(progress);
        }
      },
      onStateChange: (nextState) => {
        if (mounted.current) {
          setVoiceState(nextState);
        }
      },
      onError: (msg) => {
        if (mounted.current) {
          setVoiceError(msg);
        }
      },
    });

    return () => {
      voiceController.current?.stop();
    };
  }, []);

  // Animation réactive du spectre audio (9 barres connectées à l'AnalyserNode)
  useEffect(() => {
    let animId: number;
    const bandIndices = [2, 5, 8, 12, 16, 21, 26, 31, 36];

    const updateBars = () => {
      const isVoiceActive = voiceState !== 'idle' || speaking;
      if (isVoiceActive) {
        const data = defaultAudioEngine.getFrequencyData();
        if (data.length) {
          const nextBars = bandIndices.map((idx) => {
            const raw = data[idx] || 0;
            return Math.max(4, Math.min(24, Math.round((raw / 255) * 24)));
          });
          setFftBars(nextBars);
        }
      } else {
        // Retour progressif au repos
        setFftBars((prev) => prev.map((v) => Math.max(4, Math.round(v * 0.85))));
      }
      animId = requestAnimationFrame(updateBars);
    };

    animId = requestAnimationFrame(updateBars);
    return () => cancelAnimationFrame(animId);
  }, [voiceState, speaking]);

  useEffect(() => {
    mounted.current = true;
    // Le premier rafraîchissement est déclenché par l'effet [demo] ci-dessous.
    if ('speechSynthesis' in window) {
      const update = () => setVoices(window.speechSynthesis.getVoices());
      update();
      window.speechSynthesis.addEventListener('voiceschanged', update);
      return () => {
        mounted.current = false;
        controllers.current.forEach((c) => c.abort());
        voiceController.current?.stop();
        defaultAudioEngine.stopMic();
        window.speechSynthesis.cancel();
        window.speechSynthesis.removeEventListener('voiceschanged', update);
      };
    }
    return () => {
      mounted.current = false;
      controllers.current.forEach((c) => c.abort());
      voiceController.current?.stop();
      defaultAudioEngine.stopMic();
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [messages, busy]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!settingsOpen) setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setPresentation(false);
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [settingsOpen]);

  useEffect(() => {
    void refresh();
  }, [demo]);

  useEffect(() => {
    if (!settingsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [settingsOpen]);

  const stopSpeech = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    voiceController.current?.setAssistantSpeaking(false);
  };

  function speak(text: string) {
    if (!voicePreference.current.enabled || !('speechSynthesis' in window)) return;
    stopSpeech();
    voiceController.current?.setAssistantSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voicePreference.current.uri) || null;
    utterance.onstart = () => {
      if (mounted.current) setSpeaking(true);
    };
    utterance.onend = () => {
      if (mounted.current) {
        setSpeaking(false);
        voiceController.current?.setAssistantSpeaking(false);
      }
    };
    utterance.onerror = (event) => {
      if (mounted.current) {
        setSpeaking(false);
        voiceController.current?.setAssistantSpeaking(false);
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          setVoiceError(`Lecture vocale indisponible : ${event.error}.`);
        }
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  function toggleMic() {
    stopSpeech(); // Barge-in immédiat
    setVoiceError('');

    if (voiceState === 'listening') {
      // Si l'utilisateur clique alors qu'il parlait, envoyer immédiatement
      voiceController.current?.confirmNow();
      return;
    }

    if (voiceState === 'wake_waiting') {
      // Désactiver le mode mot de réveil
      setWakeWordMode(false);
      voiceController.current?.setWakeWordMode(false);
      return;
    }

    // Démarrer la dictée normale
    voiceController.current?.startDictation();
  }

  function toggleWakeWordMode() {
    const nextMode = !wakeWordMode;
    setWakeWordMode(nextMode);
    stopSpeech();
    setVoiceError('');
    if (nextMode) {
      defaultAudioEngine.playChime('listen');
      voiceController.current?.setWakeWordMode(true);
    } else {
      defaultAudioEngine.playChime('cancel');
      voiceController.current?.setWakeWordMode(false);
    }
  }

  function cancelVoiceInput() {
    voiceController.current?.cancel();
    setDraft('');
  }

  async function run(
    operation: () => Promise<{ message?: string; pendingActions?: PendingAction[] }>,
    clearDraft = false
  ) {
    if (lock.current || refreshLock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    stopSpeech();

    try {
      const result = await operation();
      if (!mounted.current) return;
      if (clearDraft) setDraft('');
      if (result.message) {
        setMessages((previous) => [
          ...previous,
          { id: crypto.randomUUID(), sender: 'jarvis', content: result.message!, created_at: new Date().toISOString() },
        ]);
        speak(result.message);
      }
      if (result.pendingActions) setPending(result.pendingActions);
      const [history, actions, nextWorkspace, nextHealth] = await Promise.all([
        request<Message[]>('/api/messages'),
        request<PendingAction[]>('/api/actions'),
        request<Workspace>('/api/workspace'),
        request<Health>('/api/health'),
      ]);
      if (mounted.current) {
        setMessages(history);
        setPending(actions);
        setWorkspace(nextWorkspace);
        setHealth(nextHealth);
      }
    } catch (failure) {
      if (mounted.current) {
        setError(`${failure instanceof Error ? failure.message : 'Le serveur est indisponible.'} Actualisez l’historique avant de renvoyer une action.`);
        defaultAudioEngine.playChime('error');
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function send(content = draft) {
    const message = content.trim();
    if (!message || lock.current || refreshLock.current) return;
    void run(async () => {
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), content: message, sender: 'user', created_at: new Date().toISOString() },
      ]);
      return request('/api/chat', json({ message }));
    }, true);
  }

  const isListening = voiceState === 'listening';
  const isWakeWaiting = voiceState === 'wake_waiting';
  const state = isListening ? 'listening' : busy ? 'thinking' : speaking ? 'speaking' : isWakeWaiting ? 'wake_waiting' : 'idle';
  const stateText = isListening
    ? 'Je vous écoute…'
    : busy
    ? 'Analyse en cours'
    : speaking
    ? 'Réponse vocale'
    : isWakeWaiting
    ? 'En veille · Dites « Jarvis »'
    : 'À votre écoute';

  const disabled = busy || refreshing;
  const completed = workspace.tasks.filter((t) => t.status === 'completed').length;

  function changeMode() {
    if (disabled || STATIC_DEMO) return;
    stopSpeech();
    voiceController.current?.stop();
    setDraft('');
    setError('');
    setNotice('');
    setSettingsOpen(false);
    const url = new URL(window.location.href);
    if (demo) url.searchParams.delete('demo');
    else url.searchParams.set('demo', '1');
    window.history.replaceState(null, '', url);
    setMessages([]);
    setWorkspace(initialWorkspace);
    setPending([]);
    setHealth(null);
    setDemo((value) => !value);
  }

  function exportConversation() {
    const content =
      `# Jarvis — ${demo ? 'Démonstration' : 'Conversation'}\n\n` +
      messages.map((m) => `## ${m.sender === 'user' ? 'Vous' : 'Jarvis'}\n\n${m.content}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `jarvis-${demo ? 'demo-' : ''}${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Conversation exportée en Markdown.');
  }

  function prepare(text: string) {
    setDraft(text);
    document.getElementById('message')?.focus();
  }

  return (
    <div className={`command-center ${presentation ? 'presentation' : ''} ${pending.length ? 'has-pending' : ''}`}>
      <nav className="nav-rail" aria-label="Navigation principale">
        <a className="rail-logo" href={import.meta.env.BASE_URL} aria-label="Jarvis accueil">
          <AudioLines size={26} />
        </a>
        <div className="rail-links">
          <button className={memoryFilter === 'all' ? 'active' : ''} aria-label="Vue cockpit" title="Cockpit" onClick={() => setMemoryFilter('all')}>
            <Radio size={21} />
          </button>
          <button className={memoryFilter === 'tasks' ? 'active' : ''} aria-label="Voir les tâches" title="Tâches" onClick={() => setMemoryFilter('tasks')}>
            <ListTodo size={21} />
          </button>
          <button className={memoryFilter === 'notes' ? 'active' : ''} aria-label="Voir les notes" title="Notes" onClick={() => setMemoryFilter('notes')}>
            <FileText size={21} />
          </button>
          <button aria-label="Ouvrir la palette de commandes" title="Commandes · Ctrl K" onClick={() => setPaletteOpen(true)}>
            <Command size={20} />
          </button>
        </div>
        <button className="rail-settings" aria-label="Réglages" title="Réglages" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={20} />
        </button>
        <span className="rail-avatar" title="Espace personnel">
          J
        </span>
      </nav>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span>
              jarvis<span className="brand-dot">.</span>
            </span>
            <span className="version">Votre intelligence personnelle</span>
          </div>
          <div className="top-controls">
            <button className="command-trigger" onClick={() => setPaletteOpen(true)}>
              <Command size={15} />
              <span>Une commande, une action</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className={`connection ${health ? 'online' : ''}`}>
              <i />
              {demo ? 'Démo interactive' : health ? 'Serveur connecté' : refreshing ? 'Connexion…' : 'Hors connexion'}
            </span>
            <button
              className="icon-button"
              aria-label="Actualiser toutes les données"
              title="Actualiser"
              disabled={disabled}
              onClick={() => void refresh()}
            >
              <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            </button>
            <button
              className={`icon-button ${presentation ? 'selected' : ''}`}
              aria-label={presentation ? 'Quitter la présentation' : 'Mode présentation'}
              title="Mode présentation"
              aria-pressed={presentation}
              onClick={() => setPresentation(!presentation)}
            >
              {presentation ? <Shrink size={18} /> : <Expand size={18} />}
            </button>
          </div>
        </header>
        <div className="workspace-heading">
          <div>
            <div className="date-label">
              {clock.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              <span className="date-rule" /> Espace personnel
            </div>
            <h1>Moins de friction. Plus d’action.</h1>
          </div>
          {!STATIC_DEMO && (
            <button className={`demo-toggle ${demo ? 'active' : ''}`} disabled={disabled} onClick={changeMode}>
              <Play size={13} />
              {demo ? 'Passer en session réelle' : 'Explorer la démo'}
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
        {demo && (
          <div className="demo-banner">
            <span>
              <Sparkles size={14} />{' '}
              {STATIC_DEMO
                ? 'Démo scénarisée : aucune IA ni serveur, les données restent dans votre navigateur.'
                : 'Espace de démonstration · Réponses scénarisées, données fictives, aucune action sur votre PC.'}
            </span>
            <button
              disabled={disabled}
              onClick={() => {
                demoData.current = createDemo();
                void refresh();
              }}
            >
              <RotateCcw size={13} /> {STATIC_DEMO ? 'Réinitialiser' : 'Recommencer'}
            </button>
          </div>
        )}
        <main className="console-grid">
          <section className="core-panel" aria-label="État de Jarvis">
            <div className="core-topline">
              <span>
                <i /> Intelligence en veille active
              </span>
              <span className="core-coordinate">J / 01</span>
            </div>
            <div className={`reactor-stage ${state}`}>
              <div className="reactor-grid" />
              <span className="orbit-label label-top">CONVERSATION</span>
              <span className="orbit-label label-bottom">MÉMOIRE · ACTIONS</span>
              <NeuralCore state={state} />
              <div className="core-cross cross-top" />
              <div className="core-cross cross-bottom" />
              <div className="orb-status">
                <span className={`status-dot ${state}`} />
                {demo
                  ? 'Scénario de démonstration'
                  : isWakeWaiting
                  ? 'Écoute active : « Jarvis »'
                  : isListening
                  ? 'Enregistrement vocal…'
                  : health?.provider.configured
                  ? 'Moteur configuré'
                  : 'Commandes locales'}
              </div>
            </div>

            <div className="core-caption">
              <div className="core-state" role="status">
                {/* Visualiseur de spectre audio réactif basé sur FFT */}
                <span className={`waveform ${state}`}>
                  {fftBars.map((height, i) => (
                    <i
                      key={i}
                      style={{
                        height: `${height}px`,
                        transition: 'height 0.08s ease-out',
                      }}
                    />
                  ))}
                </span>
                {stateText}
              </div>
              <h2>
                Une intention. <br />
                Le prochain pas.
              </h2>
              <p>Un espace pour penser, une voix pour avancer.</p>
            </div>

            {/* Barre de contrôle vocal & VAD */}
            <div className="core-controls">
              <button
                className={`mic-button ${isListening ? 'active' : isWakeWaiting ? 'wake-active' : ''}`}
                onClick={toggleMic}
                disabled={disabled}
                aria-pressed={isListening}
                title={isListening ? 'Valider et envoyer' : isWakeWaiting ? 'Arrêter l’écoute permanente' : 'Parler à Jarvis'}
              >
                {isListening ? <Check size={16} /> : isWakeWaiting ? <Square size={16} /> : <Mic size={17} />}
                {isListening ? 'Valider la phrase' : isWakeWaiting ? 'Arrêter l’écoute' : 'Parler à Jarvis'}
              </button>

              {isListening && (
                <button
                  className="icon-button"
                  title="Annuler sans envoyer"
                  aria-label="Annuler la dictée"
                  onClick={cancelVoiceInput}
                >
                  <X size={18} />
                </button>
              )}

              {/* Toggle Mot de Réveil (Mains libres) */}
              <button
                className={`icon-button ${wakeWordMode ? 'selected' : ''}`}
                title={wakeWordMode ? 'Mode mains libres actif (Dites « Jarvis »)' : 'Activer le mode mains libres (« Jarvis »)'}
                aria-label="Mode mains libres"
                aria-pressed={wakeWordMode}
                onClick={toggleWakeWordMode}
              >
                <Radio size={18} />
              </button>

              {/* Bouton TTS */}
              <button
                className={`icon-button ${voiceEnabled ? 'selected' : ''}`}
                title="Réponses vocales"
                aria-label={speaking ? 'Arrêter la lecture' : 'Réglages des réponses vocales'}
                aria-pressed={voiceEnabled}
                onClick={() => {
                  if (speaking) stopSpeech();
                  else setSettingsOpen(true);
                }}
              >
                <Volume2 size={18} />
              </button>
            </div>

            {/* Jauge de temporisation VAD avant auto-envoi */}
            {isListening && silenceProgress > 0 && (
              <div className="vad-progress-container" title="Envoi automatique après silence">
                <div className="vad-progress-bar" style={{ width: `${silenceProgress * 100}%` }} />
                <span>Envoi automatique dans un instant…</span>
              </div>
            )}

            <p className="voice-notice">
              {wakeWordMode
                ? 'Mode mains libres activé : dites « Jarvis » ou « Dis Jarvis » pour lui parler.'
                : 'Microphone haute fidélité avec temporisation anti-coupure et annulation sans envoi.'}
            </p>
            {voiceError && (
              <p className="voice-error" role="alert">
                {voiceError}
              </p>
            )}

            <div className="telemetry">
              <div>
                <ShieldCheck size={16} />
                <span>
                  {demo ? 'Données fictives' : 'Vous gardez le contrôle'}
                  <strong>{demo ? 'Session isolée du serveur' : 'Chaque action est confirmée'}</strong>
                </span>
              </div>
              <div>
                <Cpu size={16} />
                <span>
                  {demo ? 'Mode démo' : 'Moteur de conversation'}
                  <strong>{demo ? 'Scénario interactif' : health?.provider.model || 'À configurer'}</strong>
                </span>
              </div>
            </div>
          </section>

          <section className="conversation">
            <div className="panel-heading">
              <h2>
                <MessageSquare size={17} /> Le fil de vos idées
              </h2>
              <button
                className="icon-button"
                aria-label="Exporter la conversation"
                title="Exporter en Markdown"
                disabled={!messages.length || disabled}
                onClick={exportConversation}
              >
                <Download size={16} />
              </button>
            </div>
            <div className="conversation-context">
              <span className="assistant-mini">
                <AudioLines size={14} />
              </span>
              <span>
                Jarvis<span>{demo ? 'Votre scénario de lancement' : 'Conversation personnelle'}</span>
              </span>
              <span className="context-state">
                <i />
                {demo ? 'Démo' : health ? 'Connecté' : 'En attente'}
              </span>
            </div>
            <div className="message-list" role="log" aria-label="Conversation avec Jarvis" aria-live="polite" aria-busy={busy}>
              {messages.length === 0 && (
                <div className="empty-state">
                  <span className="greeting-symbol">
                    <Sparkles size={23} />
                  </span>
                  <h3>Qu’avez-vous en tête ?</h3>
                  <p>
                    Capturez une idée. Préparez votre journée.
                    <br />
                    Transformez « il faudrait » en « c’est fait ».
                  </p>
                  <div className="quick-start">
                    {suggestions.map((text, index) => (
                      <button disabled={disabled || !health} key={text} onClick={() => prepare(text)}>
                        <span>
                          {index === 0 ? <ListTodo size={16} /> : index === 1 ? <Monitor size={16} /> : <FileText size={16} />}{' '}
                          {index === 0 ? 'Faire le point sur mes tâches' : index === 1 ? 'Consulter mon système' : 'Garder une idée'}
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  </div>
                  {!health && !refreshing && <p className="offline-help">Lancez votre serveur ou explorez la démo pour découvrir Jarvis.</p>}
                </div>
              )}
              {messages.map((message) => (
                <ChatMessage key={message.id} {...message} timestamp={message.created_at} />
              ))}
              {busy && (
                <div className="thinking" role="status">
                  <span />
                  <span />
                  <span /> Jarvis prépare la suite…
                </div>
              )}
              <div ref={end} />
            </div>
            {error && (
              <div className="error-panel" role="alert">
                {error}
                <button disabled={disabled} onClick={() => void refresh()}>
                  Actualiser
                </button>
              </div>
            )}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <div className="prompt-chips">
              <button disabled={disabled || !health} onClick={() => prepare('Créer tâche ')}>
                <Plus size={12} /> Une tâche
              </button>
              <button disabled={disabled || !health} onClick={() => prepare('Note : ')}>
                <FileText size={12} /> Une idée
              </button>
              <button disabled={disabled || !health} onClick={() => prepare('État système')}>
                <Monitor size={12} /> Mon système
              </button>
              <button disabled={disabled || !health} onClick={() => prepare('Météo')}>
                <Sparkles size={12} /> Météo
              </button>
            </div>
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <label className="sr-only" htmlFor="message">
                Votre demande
              </label>
              <div className="composer-field">
                <textarea
                  id="message"
                  maxLength={4000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={isListening ? 'Je vous écoute…' : 'Une idée, une question, une action…'}
                  rows={2}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Envoyer la demande"
                  disabled={disabled || isListening || !health || !draft.trim()}
                >
                  <ArrowUp size={20} />
                </button>
              </div>
              <div className="composer-footer">
                <span>
                  ↵ Envoyer <span className="footer-separator">/</span> Maj ↵ Nouvelle ligne
                </span>
                <span>
                  <ShieldCheck size={12} /> Actions avec votre accord
                </span>
              </div>
            </form>
          </section>

          <aside className="memory-panel">
            <div className="panel-heading">
              <h2>Votre espace</h2>
              <span className="small-text">{String(workspace.tasks.length + workspace.notes.length).padStart(2, '0')}</span>
            </div>
            <div className="memory-tabs" aria-label="Filtrer votre espace">
              {[
                ['all', 'Tout'],
                ['tasks', 'Tâches'],
                ['notes', 'Notes'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={memoryFilter === id}
                  className={memoryFilter === id ? 'active' : ''}
                  onClick={() => setMemoryFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="memory-scroll">
              {pending.length > 0 && (
                <section className="memory-section pending-section">
                  <h3>
                    <ShieldCheck size={16} /> Votre accord <span>{pending.length}</span>
                  </h3>
                  {pending.map((action) => (
                    <article className="action-card" key={action.id}>
                      <strong>{action.label}</strong>
                      <dl className="action-arguments">
                        {Object.entries(action.args).map(([key, value]) => (
                          <div key={key}>
                            <dt>{({ title: 'Titre', content: 'Contenu', id: 'Identifiant', query: 'Recherche' } as Record<string, string>)[key] || key}</dt>
                            <dd>{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                      <small>
                        À confirmer avant{' '}
                        {new Date(action.expires_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </small>
                      <div className="action-buttons">
                        <button
                          disabled={disabled || Date.parse(action.expires_at) <= clock.getTime()}
                          onClick={() => {
                            defaultAudioEngine.playChime('confirm');
                            void run(() => request(`/api/actions/${encodeURIComponent(action.id)}/confirm`, json({})));
                          }}
                        >
                          <Check size={14} /> Confirmer
                        </button>
                        <button
                          disabled={disabled}
                          onClick={() => {
                            defaultAudioEngine.playChime('cancel');
                            void run(async () => {
                              await request(`/api/actions/${encodeURIComponent(action.id)}/cancel`, json({}));
                              return {};
                            });
                          }}
                        >
                          <X size={14} /> Annuler
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              {memoryFilter !== 'notes' && (
                <section className="memory-section">
                  <h3>
                    <ListTodo size={16} /> Le prochain pas{' '}
                    <span>
                      {completed}/{workspace.tasks.length}
                    </span>
                    <button
                      className="inline-add"
                      aria-label="Créer une tâche"
                      disabled={disabled || !health}
                      onClick={() => prepare('Créer tâche ')}
                    >
                      <Plus size={15} />
                    </button>
                  </h3>
                  {workspace.tasks.length > 0 && (
                    <div className="task-progress">
                      <i style={{ width: `${(completed / workspace.tasks.length) * 100}%` }} />
                    </div>
                  )}
                  {workspace.tasks.length === 0 ? (
                    <p className="muted">L’esprit libre. Ajoutez votre première tâche.</p>
                  ) : (
                    workspace.tasks.map((task) => (
                      <div className={`task-row ${task.status === 'completed' ? 'completed' : ''}`} key={task.id}>
                        <button
                          className="task-check"
                          aria-label={task.status === 'completed' ? `${task.title} terminée` : `Terminer ${task.title}`}
                          disabled={disabled || !health || task.status === 'completed'}
                          onClick={() => send(`Terminer tâche ${task.id}`)}
                        >
                          {task.status === 'completed' && <Check size={12} />}
                        </button>
                        <div>
                          <p>{task.title}</p>
                          <small>{task.status === 'completed' ? 'Terminée' : 'À votre rythme'}</small>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              )}
              {memoryFilter !== 'tasks' && (
                <section className="memory-section">
                  <h3>
                    <FileText size={15} /> À garder <span>{workspace.notes.length}</span>
                    <button
                      className="inline-add"
                      aria-label="Créer une note"
                      disabled={disabled || !health}
                      onClick={() => prepare('Note : ')}
                    >
                      <Plus size={15} />
                    </button>
                  </h3>
                  {workspace.notes.length === 0 ? (
                    <p className="muted">Une bonne idée mérite de rester.</p>
                  ) : (
                    workspace.notes.map((note) => (
                      <article className="note" key={note.id}>
                        <span className="note-pin" />
                        <strong>{note.title}</strong>
                        <p>{note.content}</p>
                        <button className="text-button" disabled={disabled || !health} onClick={() => send(`Oublier note ${note.id}`)}>
                          Retirer cette note
                        </button>
                      </article>
                    ))
                  )}
                </section>
              )}
              <FocusTimer />
              <details className="capabilities">
                <summary>
                  <Monitor size={14} /> Connexions & capacités <ChevronRight size={14} />
                </summary>
                {health?.capabilities.map((capability) => (
                  <div key={capability.id} className="capability">
                    <i className={capability.available ? 'available' : ''} />
                    <span>
                      {capability.label}
                      {!capability.available && <small>{capability.reason || 'Non disponible'}</small>}
                    </span>
                  </div>
                ))}
                {!health && <p className="muted">Serveur déconnecté.</p>}
                <button className="text-button" onClick={() => setSettingsOpen(true)}>
                  Configurer le moteur
                </button>
              </details>
            </div>
            <footer className="memory-footer">
              <ShieldCheck size={12} />
              {demo ? 'Données fictives · Session démo' : health?.storage === 'disk' ? 'Mémoire conservée sur votre serveur' : 'Mémoire de session'}
            </footer>
          </aside>
        </main>
        <footer className="bottom-bar">
          <span>
            <span className="footer-mark">J.</span> Pensé pour passer à l’action.
          </span>
          <span>
            {demo ? 'Démonstration' : 'Espace personnel'}
            <span className="footer-separator">/</span>
            <time>{clock.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
            <span className="footer-separator">/</span>
            <button onClick={() => setPaletteOpen(true)}>Ctrl K · Commandes</button>
          </span>
        </footer>
      </div>
      {paletteOpen && (
        <CommandPalette
          close={() => setPaletteOpen(false)}
          commands={[
            { label: 'Créer une tâche', detail: 'Préparer votre prochain pas', run: () => prepare('Créer tâche ') },
            { label: 'Capturer une idée', detail: 'Garder une note dans votre mémoire', run: () => prepare('Note : ') },
            { label: 'Consulter la météo', detail: 'Préparer la commande Météo', run: () => prepare('Météo') },
            { label: 'Consulter le système', detail: 'Préparer la commande État système', run: () => prepare('État système') },
            { label: 'Exporter la conversation', detail: 'Télécharger le fil en Markdown', run: exportConversation },
            {
              label: presentation ? 'Quitter la présentation' : 'Mode présentation',
              detail: 'Cadrage épuré pour vos captures · Échap pour quitter',
              run: () => setPresentation(!presentation),
            },
            ...(STATIC_DEMO
              ? []
              : [
                  {
                    label: demo ? 'Passer en session réelle' : 'Explorer la démo',
                    detail: disabled ? 'Disponible après la requête en cours' : 'Un scénario isolé, sans modifier vos données réelles',
                    run: changeMode,
                  },
                ]),
            { label: 'Réglages de Jarvis', detail: 'Moteur de conversation & réponses vocales', run: () => setSettingsOpen(true) },
          ]}
        />
      )}

      {settingsOpen && (
        <div
          className="settings-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            ref={dialog}
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSettingsOpen(false);
            }}
          >
            <div className="panel-heading">
              <h2 id="settings-title">Réglages de Jarvis</h2>
              <button autoFocus className="icon-button" aria-label="Fermer les réglages" onClick={() => setSettingsOpen(false)}>
                <X size={19} />
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await request('/api/settings', json({ provider, model: model.trim() }, 'PUT'));
                  setNotice('Moteur enregistré.');
                  return {};
                });
              }}
            >
              <label htmlFor="provider">Moteur de conversation</label>
              <select id="provider" value={provider} onChange={(event) => setProvider(event.target.value as 'local' | 'gemini')}>
                <option value="local">Local — Ollama</option>
                <option value="gemini">Cloud — Gemini</option>
              </select>
              <label htmlFor="model">Nom du modèle</label>
              <input
                id="model"
                required
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={provider === 'local' ? 'llama3.2' : 'gemini-2.5-flash'}
              />
              <p className="muted">
                {STATIC_DEMO
                  ? 'Version en ligne de démonstration : le moteur de conversation se configure dans votre installation locale.'
                  : 'Choisissez un modèle déjà disponible sur votre serveur. Les clés se configurent côté serveur. Changer le moteur annule les actions en attente.'}
              </p>
              {health && !health.provider.configured && <p className="voice-error">Le moteur actif n’est pas configuré sur le serveur.</p>}
              <button className="primary-button" disabled={demo || disabled || !health || !model.trim()}>
                Enregistrer le moteur
              </button>
            </form>
            <div className="voice-settings">
              <h3>Réponses vocales & Reconnaissance</h3>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  disabled={!('speechSynthesis' in window)}
                  onChange={(event) => {
                    setVoiceEnabled(event.target.checked);
                    if (!event.target.checked) stopSpeech();
                  }}
                />{' '}
                Lire les réponses de Jarvis
              </label>

              <label className="check-label">
                <input
                  type="checkbox"
                  checked={wakeWordMode}
                  onChange={(event) => {
                    setWakeWordMode(event.target.checked);
                    voiceController.current?.setWakeWordMode(event.target.checked);
                  }}
                />{' '}
                Écoute permanente du mot-clé (« Jarvis » ou « Dis Jarvis »)
              </label>

              <label htmlFor="voice">Voix du navigateur</label>
              <select
                id="voice"
                value={selectedVoice}
                onChange={(event) => setSelectedVoice(event.target.value)}
                disabled={!('speechSynthesis' in window)}
              >
                <option value="">Voix française par défaut</option>
                {voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
              <button className="secondary-button" onClick={stopSpeech} disabled={!speaking}>
                <Square size={13} /> Arrêter la lecture
              </button>
              <p className="muted">
                {VoiceController.isSupported()
                  ? 'Microphone haute fidélité avec VAD, annulation d’écho et détection du mot de réveil « Jarvis ».'
                  : 'Dictée indisponible dans ce navigateur. Le champ texte reste accessible.'}
              </p>
              {!('speechSynthesis' in window) && <p className="voice-error">Lecture vocale indisponible dans ce navigateur.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
