import type { Endpoint } from 'payload';

import { invitationEndpoints } from './invitations';
import { profileEndpoints } from './profile';
import { twoFactorLoginEndpoints } from './two-factor';

// Override de l'endpoint natif POST /users/login : Payload l'expose par
// défaut pour toutes les collections en `auth: true`. Sans cet override,
// un attaquant pourrait POST direct sur /cms/api/users/login avec
// email+password valides, recevoir le cookie payload-token et **bypass
// le 2FA**. On force tout le monde à passer par /login-2fa qui appelle
// payload.login() en interne mais ne pose le cookie qu'après vérif OTP.
const disableNativeLoginEndpoint: Endpoint = {
  path: '/login',
  method: 'post',
  handler: () =>
    new Response(
      JSON.stringify({
        error: 'Endpoint désactivé. Utiliser POST /users/login-2fa.',
      }),
      {
        status: 410,
        headers: { 'content-type': 'application/json' },
      },
    ),
};

// Tous les endpoints custom branchés sous le slug `users` (donc accessibles
// sous /cms/api/users/...).
export const authEndpoints: Endpoint[] = [
  disableNativeLoginEndpoint,
  ...invitationEndpoints,
  ...twoFactorLoginEndpoints,
  ...profileEndpoints,
];
