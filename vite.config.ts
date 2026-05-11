import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Prevent Vite's dev server from serving api/ files as browser modules.
    // In production, /api/* is handled by Vercel's serverless runtime.
    fs: {
      deny: ['api/**'],
    },
  },
})
