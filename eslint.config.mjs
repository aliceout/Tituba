// Configuration ESLint v9 (flat config) pour le frontend Astro.
//
// Symétrique de services/payload/eslint.config.mjs : on s'appuie sur
// typescript-eslint pour les .ts/.tsx et eslint-plugin-astro pour les
// .astro (qui injecte son propre parser et désactive les règles
// incompatibles avec la syntaxe Astro côté <script>).
//
// On ne bloque pas la CI sur du warn — la config est volontairement
// permissive (no-explicit-any, ban-ts-comment en warn) pour ne pas
// freiner les itérations sur le contenu éditorial.

import tseslint from 'typescript-eslint'
import astro from 'eslint-plugin-astro'

export default [
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    ignores: [
      'dist/',
      '.astro/',
      'services/',
      'node_modules/',
      // Scripts d'audit a11y en CommonJS legacy.
      'scripts/',
    ],
  },
]
