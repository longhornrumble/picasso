import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { resolve } from 'path';

// Environment-specific configuration
const ENVIRONMENT_CONFIG = {
  development: {
    API_BASE_URL: 'http://localhost:3000/api',
    WIDGET_DOMAIN: 'http://localhost:5173',
    CONFIG_DOMAIN: 'https://picasso-staging.s3.amazonaws.com'
  },
  staging: {
    API_BASE_URL: 'https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws',
    WIDGET_DOMAIN: 'https://chat-staging.myrecruiter.ai',
    CONFIG_DOMAIN: 'https://picasso-staging.s3.amazonaws.com'
  },
  production: {
    API_BASE_URL: 'https://api.myrecruiter.ai',
    WIDGET_DOMAIN: 'https://chat.myrecruiter.ai',
    CONFIG_DOMAIN: 'https://picasso-production.s3.amazonaws.com'
  }
};

export default defineConfig(({ command, mode }) => {
  // Determine build environment
  const environment = process.env.VITE_ENVIRONMENT || mode || 'production';
  const isProduction = command === 'build';
  const isDevelopment = command === 'serve' || environment === 'development';
  
  console.log(`🏗️ Building for environment: ${environment.toUpperCase()}`);
  console.log(`📦 Build mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  
  const envConfig = ENVIRONMENT_CONFIG[environment] || ENVIRONMENT_CONFIG.production;
  
  // Define environment variables for injection
  const defineVars = {
    __ENVIRONMENT__: JSON.stringify(environment),
    __API_BASE_URL__: JSON.stringify(envConfig.API_BASE_URL),
    __WIDGET_DOMAIN__: JSON.stringify(envConfig.WIDGET_DOMAIN),
    __CONFIG_DOMAIN__: JSON.stringify(envConfig.CONFIG_DOMAIN),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0')
  };
  
  console.log('🌐 Environment variables:', defineVars);

  return {
    plugins: [
      react({
        jsxRuntime: 'automatic'
      }),
      
      // Inject CSS into JS for better widget loading
      cssInjectedByJsPlugin({
        topExecutionPriority: false,
        jsAssetsFilterFunction: function customJsAssetsfilterFunction(outputChunk) {
          // Only inject CSS for widget and iframe entry points
          return outputChunk.name === 'widget' || outputChunk.name === 'iframe';
        }
      })
    ],

    // Environment variable definitions
    define: defineVars,

    // Development server configuration
    server: {
      port: 5173,
      host: '0.0.0.0',
      cors: true,
      open: false,
      hmr: {
        port: 5173
      }
    },

    // Preview server (for testing builds)
    preview: {
      port: 3000,
      host: '0.0.0.0',
      cors: true
    },

    // Build configuration
    build: {
      outDir: `dist/${environment}`,
      emptyOutDir: true,
      
      // Rollup options for multi-entry builds
      rollupOptions: {
        input: {
          // Widget entry point (host script)
          widget: resolve(__dirname, 'src/widget-standalone.js'),
          // Iframe entry point (React app)
          iframe: resolve(__dirname, 'src/iframe-main.jsx')
        },
        
        output: {
          // Place files in assets directory
          assetFileNames: 'assets/[name].[hash].[ext]',
          chunkFileNames: 'assets/[name].[hash].js',
          entryFileNames: (chunkInfo) => {
            // Widget goes to assets/widget.js, iframe goes to assets/iframe.js
            return `assets/${chunkInfo.name}.js`;
          },
          
          // Optimize for widget loading
          manualChunks: {
            // Keep React separate for better caching
            'react-vendor': ['react', 'react-dom'],
            // Keep DOMPurify separate (security-critical)
            'security': ['dompurify']
          }
        },
        
        // External dependencies (none for widget - we bundle everything)
        external: []
      },

      // Production optimizations
      minify: isProduction ? 'terser' : false,
      terserOptions: isProduction ? {
        compress: {
          drop_console: ['log', 'debug', 'info'],
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.info']
        },
        mangle: {
          safari10: true
        }
      } : undefined,

      // Source maps for debugging
      sourcemap: isDevelopment ? true : false,

      // Target modern browsers
      target: 'es2018',

      // Size limits and warnings
      chunkSizeWarningLimit: 500
    },

    // Resolve configuration
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@components': resolve(__dirname, 'src/components'),
        '@utils': resolve(__dirname, 'src/utils'),
        '@styles': resolve(__dirname, 'src/styles'),
        '@config': resolve(__dirname, 'src/config')
      }
    },

    // CSS configuration
    css: {
      postcss: {
        plugins: []
      },
      modules: {
        // Disable CSS modules - we use regular CSS with proper isolation
        localsConvention: 'camelCase'
      }
    },

    // Optimization
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'dompurify',
        'marked'
      ],
      exclude: []
    },

    // Base path configuration for different environments
    // In development: serve from root
    // In production builds: assets will be in dist/{environment}/ but served from /{environment}/
    base: isDevelopment ? '/' : `./`
  };
});