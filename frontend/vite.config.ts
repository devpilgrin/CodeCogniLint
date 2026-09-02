import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // exports-мап monaco-editor ("./<sub>" → "./esm/vs/<sub>.js") ломает
      // глубокие импорты воркеров под rolldown; алиас обходит exports и
      // позволяет `?worker`-импортам резолвиться в реальные файлы.
      'monaco-editor/esm': fileURLToPath(new URL('./node_modules/monaco-editor/esm', import.meta.url)),
    },
  },
  optimizeDeps: {
    // `?worker`-импорты monaco нельзя пребандлить: оптимизатор ломает
    // default-экспорт воркера ("does not provide an export named 'default'").
    exclude: ['monaco-editor'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
