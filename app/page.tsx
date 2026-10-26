'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken, getName, setName } from '@/lib/supabase';
import { useAuth, GoogleIcon } from '@/lib/auth';
import { useT, LangToggle } from '@/lib/i18n';
import { COLOR_HEX } from '@/components/Board';

export default function Home() {
  const { t } = useT();
  const router = useRouter();
  const [name, setN] = useState('');
  const [code, setCode] = useState('');
  const { user, required: needLogin, signIn: login, signOut } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setN(getName()); }, []);

  useEffect(() => {
    if (user && !name) setN(String(user.user_metadata?.full_name ?? '').split(' ')[0]);
  }, [user, name]);

  const fail = (e: unknown) => setErr(t.errors[(e as Error).message] ?? t.errors.server_error);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c || !name.trim()) return;
    setBusy(true); setErr('');
    setName(name.trim());
    try {
      const r = await api<{ token: string }>({ op: 'join', code: c, name });
      setToken(c, r.token);
      router.push(`/r/${c}`);
    } catch (e2) { fail(e2); setBusy(false); }
  };

  const create = async () => {
    if (!name.trim()) { setErr(t.yourName); return; }
    setBusy(true); setErr('');
    setName(name.trim());
    try {
      const r = await api<{ code: string; token: string }>({ op: 'create', name });
      setToken(r.code, r.token);
      router.push(`/r/${r.code}`);
    } catch (e2) { fail(e2); setBusy(false); }
  };

  return (
    <main className="shell home">
      <header className="top">
        <span />
        <LangToggle />
      </header>

      <section className="hero">
        <svg className="hero-board" viewBox="0 0 220 60" aria-hidden>
          {[0, 1, 2, 3].map((c) => (
            <g key={c}>
              <circle cx={30 + c * 54} cy={30} r={17} fill="#8a5a2f" />
              <circle cx={30 + c * 54} cy={30} r={14} fill={COLOR_HEX[c]} />
              <circle cx={25 + c * 54} cy={24} r={4} fill="#fff" opacity={0.7} />
            </g>
          ))}
        </svg>
        <h1 className="title">Tokken</h1>
        <p className="tagline">{t.tagline}</p>
      </section>

      <div className="home-grid">
        <form className="panel" onSubmit={join}>
          <h2>{t.joinTitle}</h2>
          <p className="muted small">{t.joinHelp}</p>
          <label className="field">{t.code}
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} className="code-input" autoCapitalize="characters" />
          </label>
          <label className="field">{t.yourName}
            <input value={name} onChange={(e) => setN(e.target.value)} maxLength={20} />
          </label>
          <button className="btn primary" type="submit" disabled={busy || !code.trim() || !name.trim()}>{t.join}</button>
        </form>

        <div className="panel">
          <h2>{t.newRoom}</h2>
          <p className="muted small">{t.newRoomHelp}</p>
          {user ? (
            <p className="small">{t.loggedInAs} <strong>{user.email}</strong> · <button className="linkish" onClick={signOut}>{t.logout}</button></p>
          ) : (
            <>
              <button className="btn google" onClick={login}>
                <GoogleIcon />
                {t.loginGoogle}
              </button>
              {needLogin && <p className="muted small">{t.loginRequired}</p>}
            </>
          )}
          <label className="field">{t.yourName}
            <input value={name} onChange={(e) => setN(e.target.value)} maxLength={20} />
          </label>
          <button className="btn primary" onClick={create} disabled={busy || (needLogin && !user)}>{t.create}</button>
        </div>
      </div>
      {err && <p className="err center">{err}</p>}

      <section className="panel practice">
        <div>
          <h2>{t.practice}</h2>
          <p className="muted small">{t.practiceHelp}</p>
        </div>
        <div className="practice-links">
          {(['training', 'hulp', 'pro'] as const).map((m) => (
            <Link key={m} href={`/oefenen?mode=${m}`} className="btn">{t.modes[m]}</Link>
          ))}
        </div>
      </section>

      <section className="panel rules-home">
        <h2>{t.rules}</h2>
        <ul>{t.rulesText.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </section>
    </main>
  );
}
