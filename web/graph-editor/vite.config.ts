import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The editor is served by Aurora's embedded HTTP server under /graph-editor/,
// so every URL Vite rewrites must carry that prefix. Vite only rewrites paths
// it processes itself (HTML tags, imports); runtime strings must be built from
// import.meta.env.BASE_URL. Aurora's own REST calls (/api/...) stay
// root-absolute on purpose.
const AURORA_PORT = process.env.AURORA_PORT ?? '8080'

export default defineConfig({
  base: '/graph-editor/',
  plugins: [react()],
  build: {
    // Emits THIRD-PARTY-NOTICES.md for every bundled npm package; the CMake
    // embed ships it inside the editor's map.
    license: { fileName: 'THIRD-PARTY-NOTICES.md' },
  },
  server: {
    // `npm run dev` gives hot reload without rebuilding C++; /api goes to a
    // running Aurora (AURORA_PORT=<port> npm run dev).
    proxy: { '/api': `http://127.0.0.1:${AURORA_PORT}` },
  },
})
