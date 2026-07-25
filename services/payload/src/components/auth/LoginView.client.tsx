'use client';

// Login en deux étapes : email/mdp puis code 2FA. Utilise les primitives
// @payloadcms/ui pour suivre le thème admin (light/dark/auto).

import React, { useState } from 'react';
import { Banner, Button } from '@payloadcms/ui';

import { inputStyle, stack } from './styles';

type Step = 'credentials' | 'two-factor';

const ADMIN_BASE = '/cms/admin';
const API_BASE = '/cms/api/users';

export default function LoginView(): React.ReactElement {
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [method, setMethod] = useState<'email' | 'totp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login-2fa`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Erreur de connexion');
      if ((data as { status?: string }).status === 'logged_in') {
        window.location.href = ADMIN_BASE;
        return;
      }
      if ((data as { status?: string }).status === 'needs_two_factor') {
        const m = ((data as { method?: string }).method ?? 'email') as 'email' | 'totp';
        setMethod(m);
        setStep('two-factor');
        setInfo(
          m === 'email'
            ? 'Un code à 6 chiffres vient d\'être envoyé à votre adresse mail.'
            : 'Saisissez le code de votre application TOTP (Google Authenticator, Authy…).',
        );
      } else {
        throw new Error('Réponse inattendue du serveur');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  async function submitTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/two-factor/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, rememberDevice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Code invalide');
      window.location.href = ADMIN_BASE;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/two-factor/resend-email`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Renvoi impossible');
      setInfo('Nouveau code envoyé.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        ...stack,
        maxWidth: 380,
        margin: 'calc(var(--base) * 3) auto',
        padding: '40px 32px',
        color: 'var(--b-ink)',
        background: 'var(--b-paper)',
        border: '1px solid var(--b-rule)',
        borderRadius: 4,
        gap: 'calc(var(--base) * 1.25)',
      }}
    >
      {/* Branding Carnet — h1 Source Serif 4 64px, point en accent.
          Réf : Design/design_handoff_admin/README.md → écran Login. */}
      <header style={{ marginBottom: 12 }}>
        <h1
          className="carnet-h1 carnet-h1--brand"
          style={{ margin: 0, marginBottom: 8 }}
        >
          Carnet<span className="dot">.</span>
        </h1>
        <p
          className="carnet-kicker"
          style={{ margin: 0, fontSize: 11, color: 'var(--b-muted)' }}
        >
          Espace d&apos;écriture
        </p>
      </header>

      {error && <Banner type="error">{error}</Banner>}
      {info && !error && <Banner type="info">{info}</Banner>}

      {step === 'credentials' && (
        <form onSubmit={submitCredentials} style={stack}>
          <div className="field-type">
            <label htmlFor="login-email" className="field-label">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div className="field-type">
            <label htmlFor="login-password" className="field-label">Mot de passe</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </Button>
          <p style={{ margin: 0, textAlign: 'center', fontSize: 14 }}>
            <a
              href="/cms/admin/forgot"
              style={{ color: 'var(--theme-text)', opacity: 0.7 }}
            >
              Mot de passe oublié ?
            </a>
          </p>
        </form>
      )}

      {step === 'two-factor' && (
        <form onSubmit={submitTwoFactor} style={stack}>
          <div className="field-type">
            <label htmlFor="login-code" className="field-label">
              {method === 'totp' ? 'Code de l\'application' : 'Code reçu par email'}
            </label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 chiffres ou code de secours"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--base) / 2)' }}>
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
            />
            Faire confiance à cet appareil pendant 7 jours
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Vérification…' : 'Valider'}
          </Button>
          {method === 'email' && (
            <Button buttonStyle="secondary" type="button" onClick={resendCode} disabled={loading}>
              Renvoyer le code
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
