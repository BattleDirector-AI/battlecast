import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: 'happy-dom',
    globals: true,
  },
  // Resolve Svelte to its browser build under Vitest so components mount in the
  // happy-dom environment (client, not SSR).
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
})
