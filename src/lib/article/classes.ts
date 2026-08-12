/**
 * Suites de classes partagées entre la coquille d'un billet et les
 * composants qu'elle monte.
 *
 * Une constante et non une règle CSS : depuis qu'ArticleHero est un
 * composant à part, une règle écrite dans PublicationArticle ne
 * l'atteindrait plus — le style scopé d'Astro ne franchit pas la
 * frontière d'un composant.
 */

/**
 * Le chapô d'un billet. Même corps que le texte de l'article (cf
 * ArticleBody) : ce n'est pas un titre secondaire, c'est déjà de la
 * lecture. Sa distinction tient à la couleur et au cadre, pas à la
 * taille.
 *
 * Justification suivie, mais sans césure : un mot coupé y attirerait
 * l'œil sur la coupure plutôt que sur le propos. La césure reste en
 * vigueur dans le corps de l'article, où les lignes sont assez
 * nombreuses pour que le gain de régularité l'emporte.
 */
export const DECK = [
  'text-muted m-0 mb-8 font-serif text-[calc(19px*var(--a11y-echelle))] leading-[1.5]',
  '[.justify_&]:text-justify [.justify_&]:hyphens-manual',
].join(' ');
