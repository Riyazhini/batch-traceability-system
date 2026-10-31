import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { VITE_API_TARGET = 'http://localhost:5000' } = loadEnv(mode, '.', 'VITE_')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': VITE_API_TARGET,
      },
    },
  }
})
