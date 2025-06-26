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
      proxy: {
        '/Master_Function': {
          target: 'https://chat.myrecruiter.ai',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log('🔄 Proxying request:', req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              console.log('✅ Proxy response:', proxyRes.statusCode);
            });
          }
        }
      }
    },
    
    // Make widget-loader.js available at root
    publicDir: 'public',

    build: {
      target: 'esnext',
      outDir: 'dist',
      emptyOutDir: true,
      minify: isProduction ? 'terser' : 'esbuild',
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,      // Remove all console.* statements
          drop_debugger: true,     // Remove debugger statements
          pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
          passes: 2,               // Run compress passes twice for better optimization
        },
        mangle: {
          safari10: true,          // Work around Safari 10/11 bugs
        },
        format: {
          comments: false,         // Remove all comments
        },
      } : undefined,
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
          assetFileNames: 'assets/[name]-[hash][extname]',
          
          // Disable code splitting for iframe to fix module loading issues
          // This ensures all dependencies are bundled into a single file
          manualChunks: (id, { getModuleInfo }) => {
            // Check if this module is imported by iframe entry
            const isIframeModule = (modulePath) => {
              if (modulePath.includes('iframe-main.jsx')) return true;
              const info = getModuleInfo(modulePath);
              if (!info || !info.importers) return false;
              return info.importers.some(imp => isIframeModule(imp));
            };
            
            // If this module is part of the iframe entry, don't split it
            if (isIframeModule(id)) {
              return undefined; // Return undefined to keep in the main chunk
            }
            
            // For the main entry point, we can still do code splitting
            if (id.includes('node_modules/react')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/marked') || id.includes('node_modules/dompurify')) {
              return 'vendor-libs';
            }
            if (id.includes('node_modules')) {
              return 'vendor';
            }
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
        '/widget.js': resolve(__dirname, 'src/widget/widget-loader.js'),
      },
    },

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