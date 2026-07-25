// Server component wrapper : injecté dans admin.components.actions pour
// que le keepalive tourne sur toutes les pages de l'admin.
import React from 'react';

import SessionKeepaliveClient from './SessionKeepalive.client';

export default function SessionKeepalive(): React.ReactElement {
  return <SessionKeepaliveClient />;
}
