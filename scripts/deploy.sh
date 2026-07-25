#!/usr/bin/env bash
# Deploy script — pull GHCR + up -d. Idempotent, pas de wipe.
#
# Invoqué par le webhook handler du VPS après un workflow GHA `Docker build`
# vert sur main. Le hook s'occupe de cloner / pull le repo dans $DEPLOY_DIR ;
# ce script se contente de :
#   1. (mode Infisical) source creds + login + export → .env
#      (mode .env manuel) vérifie que .env existe déjà
#   2. créer les bind mounts data
#   3. docker compose pull && up -d
#   4. attendre que tous les containers soient healthy
#
# Deux modes d'alimentation du .env, détectés à l'exécution :
#
#   Mode Infisical (notre setup) — si la CLI `infisical` est installée
#   ET que CREDS_FILE existe : on régénère le .env depuis Infisical à
#   chaque deploy. Avantage : rotation des secrets transparente.
#
#   Mode .env manuel (forks) — si l'un des deux manque : on suppose
#   que l'opérateur·ice a posé un .env complet à la racine de
#   $DEPLOY_DIR à la main (ou via tout autre moyen — Bitwarden,
#   pass, ansible-vault, etc.). On le respecte tel quel et on passe
#   directement à la phase docker compose.
#
# Cf issue #19 — rendre Infisical optionnel pour les forkeurs.
#
# DEPLOY_DIR est résolu depuis l'emplacement du script — le hook l'invoque
# via /var/www/carnet/scripts/deploy.sh, ça résout à /var/www/carnet.
# En dev local, ça résout à la racine du repo.
#
# CREDS_FILE par défaut : $HOME/.config/infisical/carnet.env (écrit par
# l'install.sh côté vps-install). Override via env si besoin.
#
# Depuis la migration Infisical Cloud (mai 2026), INFISICAL_API_URL dans
# CREDS_FILE pointe sur l'instance Cloud partagée (app.infisical.com ou
# l'instance custom du framework), et INFISICAL_PROJECT_ID est l'UUID du
# projet *unique* qui contient tous les services. L'arborescence est
# `/services/<nom-du-projet>/<sous-dossier>` — pour Carnet :
#   /services/carnet           → clés communes (DOMAIN, ADDRESS, DNS_*, …)
#   /services/carnet/payload   → PAYLOAD_SECRET, etc.
#   /services/carnet/postgres  → POSTGRES_*
#   /services/carnet/smtp      → SMTP_*
#   /services/carnet/web       → ADDRESS, PORT_*
# Les noms de vars n'ont pas changé, seuls les paths Infisical bougent.

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CREDS_FILE="${CREDS_FILE:-$HOME/.config/infisical/carnet.env}"
ENV_FILE="$DEPLOY_DIR/.env"

# Détection du mode. On bascule en mode manuel dès qu'un des prérequis
# Infisical manque — pas de tentative de fallback dans le mauvais sens.
USE_INFISICAL=true
if ! command -v infisical >/dev/null 2>&1; then
  USE_INFISICAL=false
fi
if [ ! -s "$CREDS_FILE" ]; then
  USE_INFISICAL=false
fi

if [ "$USE_INFISICAL" = "true" ]; then
  echo "[deploy] mode Infisical — régénération du .env depuis $CREDS_FILE"

  # 1. Charge les creds bootstrap (INFISICAL_API_URL, _PROJECT_ID, _CLIENT_ID,
  #    _CLIENT_SECRET, _ENV). Le `set -a` exporte tout ce qui est défini.
  set -a
  # shellcheck source=/dev/null
  source "$CREDS_FILE"
  set +a

  : "${INFISICAL_API_URL:?INFISICAL_API_URL manquant dans $CREDS_FILE}"
  : "${INFISICAL_PROJECT_ID:?INFISICAL_PROJECT_ID manquant dans $CREDS_FILE}"
  : "${INFISICAL_CLIENT_ID:?INFISICAL_CLIENT_ID manquant dans $CREDS_FILE}"
  : "${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET manquant dans $CREDS_FILE}"
  INFISICAL_ENV="${INFISICAL_ENV:-prod}"

  # 2. Login Infisical → token éphémère. INFISICAL_API_URL pointe sur
  #    l'instance Cloud du framework (cf. CREDS_FILE).
  TOKEN=$(infisical login --method=universal-auth \
    --domain="$INFISICAL_API_URL" \
    --client-id="$INFISICAL_CLIENT_ID" \
    --client-secret="$INFISICAL_CLIENT_SECRET" \
    --plain --silent)

  # 3. Export tous les secrets app vers .env racine. Chmod AVANT d'écrire pour
  #    qu'aucun process tiers ne puisse lire le fichier en 644 même brièvement.
  #
  #    Avec Infisical Cloud, l'arbo est `/services/carnet/<sous-dossier>` :
  #    on fetch d'abord la racine `/services/carnet` (clés communes au
  #    projet — DOMAIN, ADDRESS, DNS_*, etc.), puis chaque sous-dossier.
  #    L'ordre compte : un sous-dossier qui redéfinit une clé de la racine
  #    DOIT gagner. En .env, c'est la dernière occurrence d'une clé qui
  #    l'emporte (comportement docker compose + `set -a; source`), donc
  #    racine en premier, sous-dossiers ensuite.
  #
  #    On n'utilise pas `--recursive` (la CLI Infisical du VPS ne le
  #    supporte pas dans toutes les versions) → liste explicite. Quand
  #    on ajoute un sous-dossier dans Infisical, penser à l'ajouter ici.
  #
  #    `set -euo pipefail` au top fait aborter le script si l'un des
  #    fetch foire (.env partiel = silent broken deploy).
  : > "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  for subpath in "" payload postgres smtp web; do
    path="/services/carnet${subpath:+/$subpath}"
    echo "[deploy] fetching $path"
    infisical export \
      --domain="$INFISICAL_API_URL" \
      --projectId="$INFISICAL_PROJECT_ID" \
      --env="$INFISICAL_ENV" \
      --path="$path" \
      --format=dotenv \
      --token="$TOKEN" >> "$ENV_FILE"
  done
else
  echo "[deploy] mode .env manuel — Infisical non détecté, on attend un .env existant"
  if [ ! -s "$ENV_FILE" ]; then
    echo "ERR: pas d'Infisical configuré ET pas de .env à $ENV_FILE" >&2
    echo "    Pour la doc voir README → « Forker sans Infisical »." >&2
    exit 1
  fi
  # On respecte le fichier tel quel mais on s'assure qu'il est bien
  # restreint — si l'opérateur·ice l'a posé en 644, on remet 600.
  chmod 600 "$ENV_FILE"
fi

# Sanity check — vérifs communes aux deux modes. Si l'un de ces 2 secrets
# est absent, le deploy partirait en vrille (Postgres refuse la connexion
# / Payload refuse de booter).
grep -q '^POSTGRES_PASSWORD=' "$ENV_FILE" || {
  echo "ERR: POSTGRES_PASSWORD manquant dans $ENV_FILE" >&2
  exit 1
}
grep -q '^PAYLOAD_SECRET=' "$ENV_FILE" || {
  echo "ERR: PAYLOAD_SECRET manquant dans $ENV_FILE" >&2
  exit 1
}

# 2. Bind mounts data (Postgres + médias Payload). DATA_DIR est exporté
#    pour que `docker compose` puisse l'interpoler dans compose.yml.
export DATA_DIR="${DATA_DIR:-$HOME/data/carnet}"
mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/payload-media"

# 3. Pull les images GHCR + restart propre.
#    `down` (sans -v !) avant `up -d` libère les ports et nettoie
#    le network proprement. Sinon un docker-proxy zombie d'un deploy
#    précédent qui a crashé peut tenir le port et bloquer le `up`
#    avec "port is already allocated". L'absence de -v est cruciale :
#    -v wiperait les bind mounts (data Postgres, payload-media).
#    Tradeoff : ~2-5s de downtime entre down et up.
cd "$DEPLOY_DIR"
docker compose pull
docker compose down
docker compose up -d

# 4. Attente healthy — chaque container a son healthcheck défini dans
#    compose.yml, on les sonde via `docker inspect`. Timeout 90s.
expected="carnet-db carnet-payload carnet-site"
deadline=$(( $(date +%s) + 90 ))
echo "Waiting for services to become healthy..."
while [ "$(date +%s)" -lt "$deadline" ]; do
  all_healthy=true
  for c in $expected; do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null || echo missing)
    if [ "$status" != "healthy" ]; then
      all_healthy=false
      break
    fi
  done
  if [ "$all_healthy" = true ]; then
    echo "[carnet-deploy] OK ($(date -Iseconds))"
    docker compose ps
    exit 0
  fi
  sleep 3
done

echo "[carnet-deploy] timeout — services pas healthy à temps :" >&2
docker compose ps >&2
exit 1
