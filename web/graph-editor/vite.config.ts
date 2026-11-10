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
    // Not a budget: a tripwire for an accidental large import. The editor
    // chunk carries Grille (React Aria) and React Flow by design; see
    // [[graph-editor-cleanup]] Decisions, "No bundle budget".
    chunkSizeWarningLimit: 1000,
    // Emits THIRD-PARTY-NOTICES.md for every bundled npm package; the CMake
    // embed ships it inside the editor's map.
    license: { fileName: 'THIRD-PARTY-NOTICES.md' },
  },
  server: {
    // Theme tokens are imported from the WebUI (../ui/styles/tokens.css),
    // outside this project root.
    fs: { allow: ['..'] },
    // `npm run dev` gives hot reload without rebuilding C++; /api goes to a
    // running Aurora (AURORA_PORT=<port> npm run dev).
    // Aurora refuses cross-origin writes, so the proxy presents the request
    // as same-origin, as it is when the app serves the editor itself.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${AURORA_PORT}`,
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => req.setHeader('origin', `http://localhost:${AURORA_PORT}`))
        },
      },
    },
  },
})
