import { useEffect, useRef } from 'react';
import { defaultAudioEngine } from '../services/audioEngine';

// Sphère quantique de Fibonacci audio-réactive connectée au moteur Web Audio
export default function NeuralCore({ state }: { state: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const activity = useRef(state);
  activity.current = state;

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, width = 0, height = 0, rotation = 0, last = 0;
    let pointer = 0;
    let smoothVolume = 0;

    const points = Array.from({ length: 1000 }, (_, i) => {
      const y = 1 - (i / 999) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = Math.PI * (3 - Math.sqrt(5)) * i;
      return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
    });

    const resize = () => {
      const rect = element.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = width * ratio; element.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (reduced.matches) draw(0);
    };

    const draw = (time: number) => {
      const currentState = activity.current;
      const active = currentState !== 'idle';
      const isListening = currentState === 'listening';
      const isSpeaking = currentState === 'speaking';
      const isThinking = currentState === 'thinking';
      const isWakeWaiting = currentState === 'wake_waiting';

      // Capturer le volume réel du micro / son
      const rawVolume = defaultAudioEngine.getAverageVolume();
      // Lissage exponentiel du volume audio
      smoothVolume = smoothVolume * 0.75 + rawVolume * 0.25;

      const delta = last ? Math.min(time - last, 50) : 16;
      last = time;

      // La rotation s'accélère avec l'amplitude vocale
      const speedMultiplier = active ? (1 + smoothVolume * 3) : 1;
      rotation += reduced.matches ? 0 : delta * (active ? .00023 : .000065) * speedMultiplier;

      context.clearRect(0, 0, width, height);
      const cx = width / 2, cy = height / 2;

      // La sphère gonfle dynamiquement au son de la voix
      const baseR = Math.min(width, height) * .31;
      const r = baseR * (1 + smoothVolume * 0.35);

      // Gradient de halo selon l'état
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, r * (1.65 + smoothVolume * 0.5));
      if (isThinking) {
        glow.addColorStop(0, 'rgba(235,180,90,.32)');
        glow.addColorStop(.5, 'rgba(215,140,50,.08)');
        glow.addColorStop(1, 'rgba(215,140,50,0)');
      } else if (isListening) {
        glow.addColorStop(0, `rgba(80,180,255,${0.3 + smoothVolume * 0.4})`);
        glow.addColorStop(.5, 'rgba(60,130,255,.12)');
        glow.addColorStop(1, 'rgba(60,130,255,0)');
      } else if (isSpeaking) {
        glow.addColorStop(0, `rgba(110,160,255,${0.28 + smoothVolume * 0.35})`);
        glow.addColorStop(.5, 'rgba(70,110,255,.1)');
        glow.addColorStop(1, 'rgba(70,110,255,0)');
      } else if (isWakeWaiting) {
        glow.addColorStop(0, 'rgba(70,120,220,.18)');
        glow.addColorStop(.5, 'rgba(50,80,180,.06)');
        glow.addColorStop(1, 'rgba(50,80,180,0)');
      } else {
        glow.addColorStop(0, active ? 'rgba(79,129,255,.25)' : 'rgba(65,97,239,.15)');
        glow.addColorStop(.5, 'rgba(55,87,234,.07)');
        glow.addColorStop(1, 'rgba(55,87,234,0)');
      }
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      const a = rotation + pointer, tilt = -.25;
      const audioPulse = smoothVolume * 12;

      const projected = points.map(p => {
        const x = p.x * Math.cos(a) - p.z * Math.sin(a);
        const z = p.x * Math.sin(a) + p.z * Math.cos(a);
        const y = p.y * Math.cos(tilt) - z * Math.sin(tilt);
        const depth = p.y * Math.sin(tilt) + z * Math.cos(tilt);
        const wave = reduced.matches ? 1 : 1 + Math.sin(time * .0018 + p.y * (6 + audioPulse)) * (active ? (.045 + smoothVolume * 0.12) : .012);
        const scale = 2.8 / (2.8 - depth * .35);
        return { x: cx + x * r * scale * wave, y: cy + y * r * scale * wave, z: depth };
      }).sort((a, b) => a.z - b.z);

      for (const p of projected) {
        const alpha = Math.min(1, .14 + (p.z + 1) * .38 + smoothVolume * 0.3);
        context.beginPath();
        if (isThinking) {
          context.fillStyle = p.z > .65 ? `rgba(255,225,180,${alpha})` : `rgba(240,170,80,${alpha})`;
        } else if (isListening) {
          context.fillStyle = p.z > .65 ? `rgba(220,245,255,${alpha})` : `rgba(80,190,255,${alpha})`;
        } else {
          context.fillStyle = p.z > .65 ? `rgba(211,225,255,${alpha})` : `rgba(103,146,255,${alpha})`;
        }
        const pointSize = (p.z > .65 ? 1.55 : .85) + smoothVolume * 0.8;
        context.arc(p.x, p.y, pointSize, 0, Math.PI * 2);
        context.fill();
      }

      // Anneaux orbitaux réactifs
      for (let ring = 0; ring < 3; ring++) {
        context.save();
        context.translate(cx, cy);
        context.rotate(-.38 + ring * 1.03);
        const ringAlpha = Math.min(0.8, (.17 - ring * .03) + smoothVolume * 0.4);
        context.strokeStyle = isThinking ? `rgba(240,180,90,${ringAlpha})` : `rgba(125,157,255,${ringAlpha})`;
        context.lineWidth = .8 + smoothVolume * 1.2;
        context.beginPath();
        context.ellipse(0, 0, r * (1.26 + ring * .1), r * .46, 0, 0, Math.PI * 2);
        context.stroke();

        const orbit = rotation * (ring + 1) + ring * 2;
        context.fillStyle = isThinking ? '#ffe4b5' : '#dbe7ff';
        context.shadowColor = isThinking ? '#ffb84d' : '#739aff';
        context.shadowBlur = 12 + smoothVolume * 18;
        context.beginPath();
        context.arc(Math.cos(orbit) * r * (1.26 + ring * .1), Math.sin(orbit) * r * .46, 2.4 + smoothVolume * 1.5, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      if (!reduced.matches && !document.hidden) frame = requestAnimationFrame(draw);
    };

    const move = (e: PointerEvent) => { pointer = (e.offsetX / Math.max(width, 1) - .5) * .25; };
    const restart = () => { cancelAnimationFrame(frame); last = 0; draw(performance.now()); };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    element.addEventListener('pointermove', move);
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    resize(); restart();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, []);

  return <canvas ref={canvas} className="neural-canvas" aria-hidden="true"/>;
}
