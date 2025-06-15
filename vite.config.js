// vite.config.js - FIXED with correct browser polyfills
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    rollupOptions: {
      input: './src/widget.js',
      
      output: {
        format: 'iife',
        name: 'PicassoWidget',
        
        entryFileNames: 'widget.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'widget.css';
          }
          return '[name].[ext]';
        },
        
        manualChunks: undefined
      }
    },
    
    target: 'es2015',
    cssCodeSplit: false,
    minify: false,
    sourcemap: false
  },
  
  define: {
    // FIXED: Correct process polyfills for browser
    'process.env.NODE_ENV': '"production"',
    'process.env': '{"NODE_ENV":"production"}',
    'process.browser': 'true',
    'process.version': '""',
    'process.platform': '"browser"',
    'process.argv': '[]',
    global: 'globalThis'
  }
});