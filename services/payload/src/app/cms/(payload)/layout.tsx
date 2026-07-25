/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* Modifié manuellement pour brancher les polices @fontsource (Source Serif 4,
   Inter, JetBrains Mono) consommées par custom.scss et les composants admin
   custom — cf handoff design_handoff_admin/. Ne pas régénérer sans préserver
   les imports @fontsource ci-dessous. */
import config from '@payload-config'
import '@payloadcms/next/css'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

// Polices auto-hébergées (zéro CDN externe) — chargées avant custom.scss
// pour qu'elles soient prêtes quand on applique les --font-* en :root.
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/500.css'
import '@fontsource/source-serif-4/600.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'

import { importMap } from './admin/importMap.js'
import './custom.scss'

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
