// vite.config.js - Fixed for Iframe Architecture Support
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react({
      // Re-enable Fast Refresh since we manually inject preamble in iframe
      fastRefresh: true,
      // Configure React plugin to handle iframe properly
      include: "**/*.{jsx,tsx}"
    })
  ],
  
  // Development server configuration
  server: {
    port: 5173,
    host: true,
    cors: true,
    headers: {
      // Enable iframe embedding for development
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "frame-ancestors 'self' http://localhost:* https://localhost:*"
    },
    fs: {
      allow: ['..']
    }
  },
  
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    rollupOptions: {
      input: {
        // Only JavaScript entry points - no HTML files
        iframe: 'src/iframe-main.jsx',
        host: 'src/widget-host.js'
      },
      output: {
        // Output structure
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'host') {
            return 'widget.js'; // Host script becomes widget.js
          }
          if (chunkInfo.name === 'iframe') {
            return 'iframe-main.js'; // Remove hash for predictable naming
          }
          return '[name]-[hash].js';
        },
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]'
      }
    },
    
    // Copy public files separately
    copyPublicDir: true,
    
    target: 'es2015',
    cssCodeSplit: false,
    minify: false,
    sourcemap: true,
    logLevel: 'info'
  },
  
  define: {
    // Process polyfills for browser
    'process.env.NODE_ENV': '"production"',
    'process.env': '{"NODE_ENV":"production"}',
    'process.browser': 'true',
    'process.version': '""',
    'process.platform': '"browser"',
    'process.argv': '[]',
    global: 'globalThis',
    __PICASSO_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __PICASSO_MODE__: JSON.stringify('iframe')
  },
  
  // Resolve configuration for iframe development
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@public': resolve(__dirname, './public')
    }
  },
  
  // Public directory configuration
  publicDir: 'public'
});