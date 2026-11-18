import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';

export default function FocusTimer() {
  const [duration, setDuration] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) return;
    const update = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (!next) setDeadline(null);
    };
    update(); const timer = window.setInterval(update, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  const reset = () => { setDeadline(null); setRemaining(duration * 60); };
  return <section className={`focus-card ${deadline ? 'running' : ''}`} aria-label="Session de concentration">
    <div className="focus-heading"><span><Timer size={15}/> Une chose à la fois.</span><select aria-label="Durée de concentration" value={duration} disabled={deadline !== null} onChange={e => { const value = Number(e.target.value); setDuration(value); setRemaining(value * 60); }}><option value={15}>15 min</option><option value={25}>25 min</option><option value={50}>50 min</option></select></div>
    <div className="focus-main"><span className="focus-time" aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} secondes`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</span><div><button className="icon-button" aria-label={deadline ? 'Pause concentration' : 'Démarrer concentration'} onClick={() => setDeadline(deadline ? null : Date.now() + (remaining || duration * 60) * 1000)}>{deadline ? <Pause size={17}/> : <Play size={17}/>}</button><button className="icon-button" aria-label="Réinitialiser concentration" onClick={reset}><RotateCcw size={15}/></button></div></div>
    <div className="focus-track"><i style={{ width: `${100 * (1 - remaining / (duration * 60))}%` }}/></div><p role="status">{deadline ? 'Gardez le cap. Jarvis reste à portée de main.' : remaining === 0 ? 'Session terminée. Prenez une pause.' : 'Un peu de silence. Beaucoup d’avancées.'}</p>
  </section>;
}
