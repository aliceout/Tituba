// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// URL canonique du site — utilisée pour Astro.site, le sitemap et le
// flux RSS. Passée en env via Infisical (ADDRESS). Fallback générique
// pour les builds CI sans .env. Si la valeur ne contient pas déjà un
// schème (http:// ou https://), on préfixe https:// pour qu'Astro
// reçoive une URL valide (le validateur explose sinon avec « Invalid
// URL »).
const RAW_ADDRESS = process.env.ADDRESS ?? 'https://carnet.example.com';
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
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/cms') &&
        !page.includes('/status'),
      i18n: {
        defaultLocale: 'fr',
        locales: { fr: 'fr-FR' },
      },
    }),
  ],
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
});
