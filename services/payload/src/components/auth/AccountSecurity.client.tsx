'use client';

// Sécurité du profil : 2FA email (info statique) + gestion des
// appareils de confiance. Rendu en deux blocs ouverts par défaut, sans
// accordéon — le parent (AccountView / UserEditView) gère déjà la
// hiérarchie de sections, on ne rajoute pas un niveau de pliage.

import React, { useEffect, useState } from 'react';

const API_BASE = '/cms/api/users';

type Device = {
  deviceId: string;
  label?: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  expiresAt: string;
};

export default function AccountSecurityClient(): React.ReactElement {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDevices();
  }, []);

  async function loadDevices() {
    try {
      const res = await fetch(`${API_BASE}/me/trusted-devices`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { devices: Device[] };
        setDevices(data.devices);
      }
    } catch {
      // silencieux
    }
  }

  async function revokeDevice(deviceId: string) {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/me/trusted-devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Révocation impossible');
      await loadDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  return (
    <div className="carnet-account-security">
      {error && (
        <div className="carnet-editview__error" role="alert">
          {error}
        </div>
      )}

      <div className="carnet-account-security__group">
        <div className="carnet-account-security__title">Double authentification (2FA)</div>
        <p className="carnet-account-security__text">
          Toutes les connexions sont protégées par un{' '}
          <strong>code à 6 chiffres reçu par email</strong>. Sur un appareil de
          confiance (cf. ci-dessous), le code est demandé environ une fois par semaine.
        </p>
      </div>

      <div className="carnet-account-security__group">
        <div className="carnet-account-security__title">
          Appareils de confiance ({devices.length})
        </div>
        <p className="carnet-account-security__text">
          Ces appareils ne vous demandent pas de code à la connexion (validité 7 jours).
        </p>
        {devices.length === 0 ? (
          <p className="carnet-account-security__empty">Aucun appareil de confiance.</p>
        ) : (
          <ul className="carnet-account-security__devices">
            {devices.map((d) => (
              <li key={d.deviceId}>
                <div className="info">
                  <div className="label">{d.label ?? 'Appareil inconnu'}</div>
                  <div className="meta">
                    {d.ip ? `IP ${d.ip} · ` : ''}
                    Ajouté le {new Date(d.createdAt).toLocaleString('fr-FR')} · expire le{' '}
                    {new Date(d.expiresAt).toLocaleString('fr-FR')}
                  </div>
                </div>
                <button
                  type="button"
                  className="carnet-btn carnet-btn--ghost"
                  onClick={() => void revokeDevice(d.deviceId)}
                >
                  Révoquer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
