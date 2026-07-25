// Wrapper server-component pour exposer LoginView comme custom view
// Payload (admin.components.views.login). Pas de styling propre — le
// wrapping (template-minimal) est géré par Payload et suit le thème.
import React from 'react';

import LoginViewClient from './LoginView.client';

export default function LoginView(): React.ReactElement {
  return <LoginViewClient />;
}
