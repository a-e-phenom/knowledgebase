import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder', '@tiptap/extension-link', '@tiptap/extension-image', '@tiptap/extension-task-list', '@tiptap/extension-task-item']
  }
})
