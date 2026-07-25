// Configuration ESLint v9 (flat config) pour le backend Payload.
//
// Anciennement basée sur FlatCompat + eslint-config-next, mais ce
// dernier expose un bug de structure circulaire avec ESLint v9
// (cf. vercel/next.js#68334) qui faisait planter le linter à l'init.
// On bascule sur typescript-eslint directement, plus react-hooks pour
// les composants admin custom (services/payload/src/components/admin/).
//
// Les fichiers générés (payload-types, importMap, migrations auto)
// sont ignorés.

import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // On garde le projet en mouvement — les codes de retour TS
      // discutables passent en warn plutôt qu'en error pour ne pas
      // bloquer la CI sur des refacto en cours.
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
      '@typescript-eslint/no-require-imports': 'warn',
      // React hooks — règles classiques. `exhaustive-deps` reste
      // référencé via `eslint-disable-next-line` dans plusieurs
      // composants ; sans le plugin chargé, ESLint signalait
      // « Definition for rule not found » et faisait planter le lint.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: [
      '.next/',
      'src/payload-types.ts',
      'src/payload-generated-schema.ts',
      // Migrations auto-générées par Payload — on n'en lint pas
      // le bruit (params `payload`/`req` non utilisés sur les up/down).
      'src/migrations/',
      'src/app/cms/(payload)/admin/importMap.js',
    ],
  },
]
