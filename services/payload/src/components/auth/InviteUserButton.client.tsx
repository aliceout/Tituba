'use client';

// Bouton "Inviter un·e utilisateur·ice" en haut de la liste users.
// Ouvre un Drawer Payload natif avec email + rôle. Toutes les couleurs
// suivent le thème admin (light/dark/auto) via les CSS vars Payload.

import React, { useState } from 'react';
import { Banner, Button, Drawer, useModal } from '@payloadcms/ui';

import { inputStyle, stack } from './styles';

const API_BASE = '/cms/api/users';
const DRAWER_SLUG = 'invite-user';

export default function InviteUserButton({ canInviteAdmin }: { canInviteAdmin: boolean }): React.ReactElement {
  const { openModal, closeModal } = useModal();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'admin'>('editor');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setEmail('');
    setDisplayName('');
    setRole('editor');
    setError(null);
    setDone(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role, displayName: displayName || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Invitation impossible');
      setDone(`Invitation envoyée à ${email}.`);
      setTimeout(() => {
        closeModal(DRAWER_SLUG);
        reset();
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div style={{ marginBottom: 'var(--base)' }}>
        <Button onClick={() => openModal(DRAWER_SLUG)}>
          Inviter un·e utilisateur·ice
        </Button>
      </div>

      <Drawer slug={DRAWER_SLUG} title="Inviter un·e utilisateur·ice" gutter>
        <form onSubmit={submit} style={stack}>
          {error && <Banner type="error">{error}</Banner>}
          {done && <Banner type="success">{done}</Banner>}

          <div className="field-type">
            <label htmlFor="invite-email" className="field-label">Email</label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div className="field-type">
            <label htmlFor="invite-name" className="field-label">Nom affiché (optionnel)</label>
            <input
              id="invite-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div className="field-type">
            <label htmlFor="invite-role" className="field-label">Rôle</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'admin')}
              style={inputStyle}
            >
              <option value="editor">Éditeur·ice (édite le contenu)</option>
              {canInviteAdmin && (
                <option value="admin">Admin (peut aussi gérer les comptes)</option>
              )}
            </select>
            <p style={{ margin: 'calc(var(--base) / 4) 0 0', fontSize: '0.85em', opacity: 0.7 }}>
              Un mail d'invitation sera envoyé. Lien valable 7 jours.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'calc(var(--base) / 2)', justifyContent: 'flex-end' }}>
            <Button
              buttonStyle="secondary"
              type="button"
              onClick={() => {
                closeModal(DRAWER_SLUG);
                reset();
              }}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Envoi…' : 'Envoyer l\'invitation'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
