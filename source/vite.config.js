import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({
  root: 'frontend',
  envDir: '..',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions:{input:{main:resolve(import.meta.dirname,'frontend/index.html'),pcp:resolve(import.meta.dirname,'frontend/pcp.html'),programacao:resolve(import.meta.dirname,'frontend/pcp-programacao.html')}} },
})

