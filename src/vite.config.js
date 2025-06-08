import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    terserOptions: {
      format: {
        ascii_only: false,  // Don't escape Unicode characters
        beautify: false
      }
    }
  }
})