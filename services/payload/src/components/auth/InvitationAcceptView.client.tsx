'use client';

// Page d'acceptation d'invitation : /cms/admin/invitation/[token].
// Récupère le token dans l'URL, demande prénom + mot de passe, envoie au
// backend pour activer le compte. Suit le thème admin via les CSS vars
// Payload + composants @payloadcms/ui.

import React, { useEffect, useState } from 'react';
import { Banner, Button } from '@payloadcms/ui';

import { inputStyle, stack } from './styles';

const API_BASE = '/cms/api/users';
const ADMIN_BASE = '/cms/admin';

export default function InvitationAcceptViewClient({ token }: { token: string }): React.ReactElement {
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'expired'>('loading');
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/invitation/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.status === 410) return setStatus('expired');
        if (!res.ok) return setStatus('invalid');
        const data = (await res.json()) as { email?: string };
        if (!data.email) return setStatus('invalid');
        setEmail(data.email);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanedFirstName = firstName.trim();
    if (!cleanedFirstName) return setError('Le prénom est obligatoire.');
    if (password.length < 12) return setError('Le mot de passe doit faire au moins 12 caractères.');
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/invitation/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password, displayName: cleanedFirstName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Activation impossible');
      window.location.href = ADMIN_BASE;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  const wrapper: React.CSSProperties = {
    ...stack,
    maxWidth: 'calc(var(--base) * 20)',
    margin: 'calc(var(--base) * 3) auto',
    padding: 'var(--base)',
    color: 'var(--theme-text)',
    background: 'var(--theme-elevation-50)',
    borderRadius: 4,
  };

  if (status === 'loading') return <p style={{ textAlign: 'center', marginTop: 'calc(var(--base) * 3)' }}>Chargement…</p>;

  if (status === 'invalid') {
    return (
      <div style={wrapper}>
        <h1 style={{ margin: 0 }}>Invitation introuvable</h1>
        <p style={{ margin: 0 }}>Ce lien d'invitation est invalide ou a déjà été utilisé. Demandez à un administrateur de vous renvoyer une invitation.</p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div style={wrapper}>
        <h1 style={{ margin: 0 }}>Invitation expirée</h1>
        <p style={{ margin: 0 }}>Le délai pour activer ce compte a expiré. Demandez à un administrateur de vous inviter à nouveau.</p>
      </div>
    );
  }

  return (
    <div style={wrapper}>
      <h1 style={{ margin: 0 }}>Activer votre compte</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>Compte : <strong>{email}</strong></p>

      {error && <Banner type="error">{error}</Banner>}

      <form onSubmit={submit} style={stack}>
        <div className="field-type">
          <label htmlFor="invite-firstname" className="field-label">Prénom</label>
          <input
            id="invite-firstname"
            type="text"
            autoComplete="given-name"
            required
            autoFocus
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className="field-type">
          <label htmlFor="invite-pw" className="field-label">Mot de passe (min. 12 caractères)</label>
          <input
            id="invite-pw"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className="field-type">
          <label htmlFor="invite-pw2" className="field-label">Confirmer le mot de passe</label>
          <input
            id="invite-pw2"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={inputStyle}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Activation…' : 'Activer mon compte'}
        </Button>
      </form>
    </div>
  );
}
