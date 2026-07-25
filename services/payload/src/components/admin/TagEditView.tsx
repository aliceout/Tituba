// TagEditView — wrapper server qui redirige systématiquement vers la
// liste des tags. Le modèle Tag est trop simple pour mériter une page
// d'édition séparée : tout se fait en édition inline depuis la liste.
// Cette redirection évite qu'un clic accidentel ou une URL tapée à la
// main n'ouvre la vue native Payload (qui casserait le langage visuel
// de l'admin Carnet).

import { redirect } from 'next/navigation';

export default function TagEditView(): never {
  redirect('/cms/admin/collections/tags');
}
