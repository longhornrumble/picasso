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
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Content-Security-Policy': "frame-ancestors 'self' http://localhost:* https://localhost:*"
    },
    fs: {
      allow: ['..']
    }
  },
  
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    
    rollupOptions: {
      input: {
        main: 'src/main.jsx',
        iframe: 'src/iframe-main.jsx',
        host: 'src/widget-host.js',
        'widget-frame': resolve(__dirname, 'widget-frame.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'main') {
            return 'main.js';
          }
          if (chunkInfo.name === 'host') {
            return 'widget.js';
          }
          if (chunkInfo.name === 'iframe') {
            return 'iframe-main.js';
          }
          return '[name]-[hash].js';
        },
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
        
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['lucide-react']
        }
      }
    },
    
    // Copy public files separately
    copyPublicDir: true,
    
    chunkSizeWarningLimit: 500,
    logLevel: 'info'
  },
  
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    __PICASSO_VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0'),
    __PICASSO_MODE__: JSON.stringify('iframe'),
    __PICASSO_SECURE__: JSON.stringify(process.env.NODE_ENV === 'production')
  },
  
  // Resolve configuration for iframe development
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@public': resolve(__dirname, './public')
    }
  },
  
  publicDir: 'public',
  
  optimizeDeps: {
    include: ['react', 'react-dom', 'marked', 'dompurify'],
    exclude: ['@testing-library/react', '@testing-library/jest-dom']
  }
});