import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Search, X } from 'lucide-react';
export interface Command { label: string; detail: string; run(): void }
export default function CommandPalette({ commands, close }: { commands: Command[]; close(): void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLElement>(null);
  const filtered = commands.filter(c => `${c.label} ${c.detail}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const panel = root.current;
    root.current?.querySelector('input')?.focus();
    return () => { if (panel?.contains(document.activeElement) || document.activeElement === document.body) previous?.focus(); };
  }, []);
  return <div className="settings-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}><section ref={root} className="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes" onKeyDown={e => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && filtered[selected]) { e.preventDefault(); filtered[selected].run(); close(); }
    if (e.key === 'Tab') {
      const nodes = root.current?.querySelectorAll<HTMLElement>('input, button');
      if (!nodes?.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
    }
  }}><div className="palette-search"><Search size={20}/><input aria-label="Rechercher une commande" placeholder="Que voulez-vous faire ?" value={query} onChange={e => { setQuery(e.target.value); setSelected(0); }}/><button className="icon-button" onClick={close} aria-label="Fermer les commandes"><X size={18}/></button></div><div className="palette-results">{filtered.map((c, i) => <button key={c.label} className={i === selected ? 'active' : ''} onClick={() => { c.run(); close(); }}><span>{c.label}<small>{c.detail}</small></span><ArrowUpRight size={17}/></button>)}{!filtered.length && <p className="muted">Aucune commande. Essayez « tâche » ou « démo ».</p>}</div><footer><span>↑ ↓ Naviguer &nbsp; ↵ Choisir</span><span>Échap Fermer</span></footer></section></div>;
}
