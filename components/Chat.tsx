'use client';
import { useEffect, useRef, useState } from 'react';
import { sb, api } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { COLOR_HEX } from './Board';

interface Msg { id: number; at: string; player_id: string; name: string; color: number | null; text: string }

export default function Chat({ code, token, myId }: { code: string; token: string | null; myId: string | null }) {
  const { t } = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const client = sb();
    let alive = true;
    client.from('chat_messages').select('*').eq('code', code).order('id', { ascending: false }).limit(60)
      .then(({ data }) => { if (alive && data) setMsgs((data as Msg[]).reverse()); });
    const ch = client.channel(`chat-${code}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `code=eq.${code}` }, (payload) => {
        const m = payload.new as Msg;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur.slice(-80), m]));
        if (!openRef.current && m.player_id !== myId) setUnread((u) => u + 1);
      })
      .subscribe();
    return () => { alive = false; client.removeChannel(ch); };
  }, [code, myId]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, open]);
  useEffect(() => { if (open) setUnread(0); }, [open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || !token) return;
    setText('');
    try { await api({ op: 'chat', code, token, text: v }); } catch { setText(v); }
  };

  return (
    <div className={`chat ${open ? 'open' : ''}`}>
      <button className="chat-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{t.chat}</span>
        {unread > 0 && <span className="badge">{unread}</span>}
        <span className="chev" aria-hidden>{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="chat-body">
          <div className="chat-list" ref={listRef}>
            {msgs.length === 0 && <p className="muted small">{t.chatEmpty}</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`msg ${m.player_id === myId ? 'me' : ''}`}>
                <span className="who" style={{ color: m.color !== null ? COLOR_HEX[m.color] : undefined }}>{m.name}</span>
                <span className="txt">{m.text}</span>
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t.chatPlaceholder} disabled={!token} />
            <button className="btn small primary" type="submit" disabled={!text.trim()}>{t.send}</button>
          </form>
        </div>
      )}
    </div>
  );
}
