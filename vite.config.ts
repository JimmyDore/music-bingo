/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En dev, l'API tourne à côté (npm run api) : même origine côté navigateur.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    // Le serveur a sa propre suite (`node --test`) : vitest ne regarde que le front.
    include: ['src/**/*.test.ts'],
  },
})
