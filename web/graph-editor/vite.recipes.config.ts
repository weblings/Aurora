import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The recipes page for the Pages site, built apart from the editor so it never lands in the binary's
// embedded map (Aurora-4g4d.2). Relative base: it works under /Aurora/recipes/ or any sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-recipes',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    license: { fileName: 'THIRD-PARTY-NOTICES.md' },
    rollupOptions: { input: resolve(import.meta.dirname, 'recipes.html') },
  },
  // The clips live in the repo's docs/recipes.
  server: { fs: { allow: ['../..'] } },
})
