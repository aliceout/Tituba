import type { Block } from 'payload';

/**
 * Bloc « dépliant » — un titre cliquable qui révèle son contenu sur
 * place, rendu en `<details>` / `<summary>`.
 *
 * Sert à poser dans une page un texte long qui compte, mais qui
 * couperait la lecture s'il s'étalait : les positions de fond sur la
 * page « Nous rejoindre », une FAQ, un rappel de méthode.
 *
 * Même forme que Prose — un titre, du rich text — et c'est voulu : la
 * vue d'édition réutilise le même éditeur, il n'y a rien de neuf à
 * apprendre pour s'en servir.
 *
 * Le `<details>` natif est préféré à un accordéon en JavaScript : il
 * s'ouvre sans script, le clavier et les lecteurs d'écran le
 * connaissent, et la recherche du navigateur (Ctrl+F) déplie
 * automatiquement le contenu qu'elle y trouve.
 */
export const Depliant: Block = {
  slug: 'depliant',
  labels: { singular: 'Dépliant', plural: 'Dépliants' },
  fields: [
    {
      name: 'titre',
      type: 'text',
      required: true,
      label: 'Titre du dépliant',
      admin: {
        description:
          'La ligne toujours visible, sur laquelle on clique pour ouvrir. Obligatoire : sans elle, il n’y aurait rien à cliquer.',
      },
    },
    {
      name: 'ouvert',
      type: 'checkbox',
      defaultValue: false,
      label: 'Déplié par défaut',
      admin: {
        description:
          'Coché, le contenu est visible dès l’arrivée sur la page — le bloc ne sert plus qu’à pouvoir le replier.',
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: 'Contenu',
    },
  ],
};
