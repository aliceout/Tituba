'use client';

// Context propagé aux DecoratorNodes Lexical (BiblioInlineRenderer)
// pour qu'ils puissent peupler leurs pickers depuis la liste de
// références chargée par PostEditView au mount. Externalisé ici plutôt
// que dans Editor.tsx pour éviter un cycle d'import avec nodes.tsx
// (Editor importe les nodes ; les nodes importent le hook).

import React from 'react';

export type BibAuthor = {
  firstName?: string | null;
  lastName: string;
  role?: 'author' | 'editor' | 'translator';
};

export type BibEntry = {
  id: number | string;
  slug?: string;
  authors?: BibAuthor[] | null;
  authorLabel?: string | null;
  year?: number | string;
  title?: string;
};

export const BiblioOptionsContext = React.createContext<BibEntry[]>([]);

export function useBiblioOptions(): BibEntry[] {
  return React.useContext(BiblioOptionsContext);
}

// ─── Médias ───────────────────────────────────────────────────────
// Liste des médias chargée par PostEditView au mount, propagée aux
// FigureRenderer pour qu'ils puissent peupler leur picker (search +
// preview thumbnail) au lieu de demander à l'utilisateur·rice de
// coller un id Payload — UX inacceptable.

export type MediaEntry = {
  id: number | string;
  filename?: string | null;
  alt?: string | null;
  title?: string | null;
  url?: string | null;
  thumbnailURL?: string | null;
  mimeType?: string | null;
  filesize?: number | null;
  width?: number | null;
  height?: number | null;
};

export const MediaOptionsContext = React.createContext<MediaEntry[]>([]);

export function useMediaOptions(): MediaEntry[] {
  return React.useContext(MediaOptionsContext);
}
