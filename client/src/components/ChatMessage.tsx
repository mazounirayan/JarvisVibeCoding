import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
interface Props { sender: 'user' | 'jarvis'; content: string; timestamp?: string }
export default function ChatMessage({ sender, content, timestamp }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopied(true); setError(''); }
    catch { setError('Copie indisponible. Sélectionnez le texte pour le copier.'); }
  }
  return <article className={`message ${sender}`}><div className="message-body"><div className="message-meta"><strong>{sender === 'jarvis' ? 'Jarvis' : 'Vous'}</strong>{timestamp && <time dateTime={timestamp}>{new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>}<button className="copy-message" aria-label={copied ? 'Message copié' : 'Copier le message'} onClick={() => void copy()}>{copied ? <Check size={11}/> : <Copy size={11}/>} {copied ? 'Copié' : 'Copier'}</button></div><p>{content}</p>{error && <small role="status">{error}</small>}</div></article>;
}
