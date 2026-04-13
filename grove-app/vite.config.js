import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Allow process.env-style access for Anthropic SDK internals
    'process.env': {},
  },
  server: {
    port: 5173,
  },
})
