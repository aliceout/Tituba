// Styles partagés pour les composants auth custom (LoginView,
// InvitationAcceptView, InviteUserButton). Branchés sur les CSS vars
// Payload pour suivre le thème admin (light/dark/auto).

import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: 'calc(var(--base) / 2)',
  background: 'var(--theme-input-bg)',
  color: 'var(--theme-text)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
  fontSize: 'inherit',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--base)',
};
