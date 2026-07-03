import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

// The companion server (`battlecast serve`, default :7397) owns the config/asset
// API. In dev, Vite serves the app on :5173, so proxy those API/asset paths to
// the server — without it, `/config` can't reach the server and its Save/upload
// controls stay disabled. `/logos/<file>` is a server asset, but bare `/logos` is
// an overlay route: the trailing-slash key matches only the former, so the
// `/logos` render page is still served by Vite.
const API_TARGET = process.env.BATTLECAST_SERVER || 'http://127.0.0.1:7397'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/logos/': { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
  // Resolve Svelte to its browser build under Vitest so components mount in the
  // happy-dom environment (client, not SSR).
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
})
