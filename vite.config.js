import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

// Lê a versão do package.json para injetar no app (Opção A — versão automática)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  // Injeta a versão do package.json como constante global __APP_VERSION__
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' = não recarrega sozinho durante uso
      // O App.jsx aplica a atualização automaticamente só quando o usuário está na Home
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Auditoria de Campo — DPL',
        short_name: 'Auditoria DPL',
        description: 'Sistema de auditoria operacional de campo — DPL Construções',
        theme_color: '#1e3a5f',
        background_color: '#f0f4f8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Aplica o novo SW imediatamente quando o App.jsx solicitar (updateServiceWorker)
        skipWaiting: true,
        clientsClaim: true,
        // [DPL] Bundle principal cresceu além do limite padrão (2MB) do
        // Workbox depois de incluir o SDK da Transistor Software — sem
        // isso, o chunk principal fica de fora do precache, quebrando o
        // "funciona offline" do PWA no navegador (o app Android nativo não
        // depende disso, mas o PWA instalável no navegador depende).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            }
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unpkg-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            }
          }
        ]
      }
    })
  ]
})
