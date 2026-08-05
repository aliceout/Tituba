/**
 * Astérisques de mise en avant — pendant admin de `stripHeroMarkers`
 * côté site (src/lib/site.ts).
 *
 * Un titre saisi dans l'admin peut porter des astérisques autour des
 * mots à surligner : « Le genre aux prismes *féministe* ». Le site les
 * interprète — en `<em>` surligné dans un h1, effacées ailleurs (onglet
 * du navigateur, libellé de menu). L'admin, lui, les affichait telles
 * quelles partout : dans les colonnes de liste, les fils d'Ariane, les
 * sélecteurs de page. On lisait donc « L'*association* » à des endroits
 * où l'astérisque n'a aucun sens, et où elle ressemblait à une faute de
 * frappe restée dans le contenu.
 *
 * À n'appliquer qu'à l'**affichage**. Jamais à la valeur d'un champ de
 * saisie : c'est là qu'on écrit les astérisques, les effacer rendrait le
 * surlignage impossible à relire et à corriger.
 *
 * Le générique conserve le typage exact — un `string` en entrée reste un
 * `string` en sortie —, ce qui permet de l'appliquer à un titre nullable
 * sans avoir à traiter le cas à l'appel.
 */
export function stripHeroMarkers<T extends string | null | undefined>(s: T): T {
  if (typeof s !== 'string') return s;
  return s.replace(/\*([^*]+)\*/g, '$1') as T;
}
