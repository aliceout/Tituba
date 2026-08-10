// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// URL canonique du site — utilisée pour Astro.site, le sitemap et le
// flux RSS. Passée en env via Infisical (ADDRESS). Fallback générique
// pour les builds CI sans .env. Si la valeur ne contient pas déjà un
// schème (http:// ou https://), on préfixe https:// pour qu'Astro
// reçoive une URL valide (le validateur explose sinon avec « Invalid
// URL »).
const RAW_ADDRESS = process.env.ADDRESS ?? 'https://tituba.example.com';
const ADDRESS = /^https?:\/\//.test(RAW_ADDRESS)
  ? RAW_ADDRESS
  : `https://${RAW_ADDRESS}`;

export default defineConfig({
  site: ADDRESS,
  trailingSlash: 'ignore',
  // SSR via Node : chaque requête tape Payload (réseau docker
  // interne en prod, localhost:3001 en dev). Pas de rebuild CI
  // à chaque save côté admin — édition instantanément visible.
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  // Plus d'intégration `sitemap` : en rendu serveur elle ne connaît que
  // les routes statiques, et ne listait donc aucune publication — ni
  // article, ni épisode, ni thématique. Un plan figé au build vieillit
  // en outre dès la parution suivante, alors que rien ici ne se
  // reconstruit quand on publie. Le plan est désormais servi à la
  // demande par src/pages/sitemap.xml.ts.
  integrations: [],
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
});
