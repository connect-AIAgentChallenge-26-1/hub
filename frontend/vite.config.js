import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Pages(https://<user>.github.io/hub/)에 배포하므로 빌드 시에만 base를 '/hub/'로 둔다.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/hub/' : '/',
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
}))
