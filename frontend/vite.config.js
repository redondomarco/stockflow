import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// El historial de cambios vive en la raíz del repo (CHANGELOG.md) y se incorpora al
// frontend al compilar (pantalla Sistema → Acerca de). En Docker se copia a /CHANGELOG.md.
const changelogPath = path.resolve(__dirname, '../CHANGELOG.md')

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Regex para conservar el sufijo de la importación ('@changelog?raw')
    alias: [{ find: /^@changelog(\?.*)?$/, replacement: `${changelogPath}$1` }],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    fs: { allow: ['.', changelogPath] },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      }
    }
  }
})
