'use client';
import { useEffect, useRef, useState } from 'react';
import { api, sb } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type Message = { id: number; player_id: string; name: string; color: number | null; text: string; at: string };
export default function Chat({ gameId, code, token, playerId }: { gameId: string; code: string; token: string; playerId: string }) {
  const { lang } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const sendingRef = useRef(false);
  useEffect(() => {
    let alive = true;
    let loading = false;
    let reload = false;
    const load = async () => {
      if (loading) { reload = true; return; }
      loading = true;
      const { data, error } = await sb().from('chat_messages').select('id,player_id,name,color,text,at')
        .eq('code', code).order('at', { ascending: false }).order('id', { ascending: false }).limit(100);
      loading = false;
      if (!alive) return;
      if (error) setError(lang === 'nl' ? 'Chat niet bereikbaar. We proberen opnieuw.' : 'Chat unavailable. Retrying.');
      else {
        setMessages((prev) => {
          const merged = new Map([...prev, ...(data ?? [])].map((m) => [m.id, m]));
          return [...merged.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id).slice(-100);
        });
        setError('');
      }
      if (reload) { reload = false; void load(); }
    };
    void load();
    const ch = sb().channel(`chat-${gameId}`).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `code=eq.${code}`,
    }, () => { void load(); }).subscribe((status) => { if (status === 'SUBSCRIBED') void load(); });
    const timer = setInterval(() => { void load(); }, 10000);
    return () => { alive = false; clearInterval(timer); void sb().removeChannel(ch); };
  }, [gameId, code, lang]);
  useEffect(() => {
    if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);
  return <div className="chat">
    <h3>Chat <span className="muted small">· live</span></h3>
    <div className="chat-messages" ref={list} role="log" aria-live="polite" aria-label="Chat"
      onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
      {!messages.length && <p className="muted small">{lang === 'nl' ? 'Zeg iets tegen je tafelgenoten.' : 'Say hello to your table.'}</p>}
      {messages.map((m) => <div key={m.id} className={`chat-message ${m.player_id === playerId ? 'own' : ''}`}>
        <div><strong>{m.name}</strong> <time>{new Date(m.at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</time></div>
        <p>{m.text}</p>
      </div>)}
    </div>
    <form onSubmit={async (e) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true; setSending(true); setError('');
      try {
        const message = await api<Message>({ op: 'chat', code, token, text });
        follow.current = true;
        setMessages((prev) => [...prev.filter((m) => m.id !== message.id), message].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id).slice(-100));
        setDraft('');
      } catch { setError(lang === 'nl' ? 'Bericht niet verstuurd. Probeer opnieuw.' : 'Message not sent. Try again.'); }
      finally { sendingRef.current = false; setSending(false); }
    }}>
      <input aria-label={lang === 'nl' ? 'Chatbericht' : 'Chat message'} placeholder={lang === 'nl' ? 'Typ een bericht…' : 'Type a message…'} value={draft} maxLength={300} disabled={sending} onChange={(e) => setDraft(e.target.value)} />
      <button className="btn small" disabled={sending || !draft.trim()}>{sending ? '…' : lang === 'nl' ? 'Stuur' : 'Send'}</button>
    </form>
    {error && <p className="err small" role="alert">{error}</p>}
  </div>;
}
