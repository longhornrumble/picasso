// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    plugins: [
      react({
        fastRefresh: true,
        include: "**/*.{jsx,tsx}",
      }),
    ],

    // Development server configuration
    server: {
      port: 5173,
      host: true,
      cors: true,
      headers: {
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Content-Security-Policy': "frame-ancestors 'self' http://localhost:* https://localhost:*"
      },
    },

    build: {
      target: 'esnext',
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'esbuild',
      sourcemap: isProduction ? false : 'inline',
      cssCodeSplit: true,

      rollupOptions: {
        input: {
          main: 'src/main.jsx', // For the host page
          iframe: 'src/iframe-main.jsx', // For the widget iframe
          'widget-frame': resolve(__dirname, 'widget-frame.html'),
        },
        output: {
          // Consistent naming for predictable script tags
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name.endsWith('.css')) {
              return 'assets/[name][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
      copyPublicDir: true,
      chunkSizeWarningLimit: 600,
      logLevel: 'info',
    },

    define: {
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      __PICASSO_VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0'),
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },

    publicDir: 'public',

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
      },
    },
    
    optimizeDeps: {
      include: ['react', 'react-dom', 'marked', 'dompurify', 'prop-types'],
    },
  };
});