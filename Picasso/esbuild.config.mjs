import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Path alias plugin for esbuild
const pathAliasPlugin = {
  name: 'path-alias',
  setup(build) {
    const aliases = {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@styles': path.resolve(__dirname, 'src/styles'),
      '@config': path.resolve(__dirname, 'src/config')
    };

    // Handle alias resolution
    build.onResolve({ filter: /^@/ }, args => {
      for (const [alias, aliasPath] of Object.entries(aliases)) {
        if (args.path === alias || args.path.startsWith(alias + '/')) {
          const resolvedPath = args.path.replace(alias, aliasPath);
          return { path: path.resolve(resolvedPath) };
        }
      }
    });
  }
};

// Bundle analyzer plugin
const bundleAnalyzerPlugin = {
  name: 'bundle-analyzer',
  setup(build) {
    build.onEnd((result) => {
      if (result.metafile && process.env.ANALYZE === 'true') {
        console.log('\n📊 Bundle Analysis:');
        const outputs = result.metafile.outputs;
        const totalSize = Object.values(outputs).reduce((sum, output) => sum + output.bytes, 0);
        console.log(`Total bundle size: ${(totalSize / 1024).toFixed(2)} KB`);
        
        // Show individual chunk sizes
        Object.entries(outputs).forEach(([file, output]) => {
          const sizeKB = (output.bytes / 1024).toFixed(2);
          console.log(`  ${path.basename(file)}: ${sizeKB} KB`);
          
          // Warn for large chunks
          if (output.bytes > 150 * 1024) { // 150KB threshold
            console.warn(`⚠️  Large chunk detected: ${path.basename(file)} (${sizeKB} KB)`);
          }
        });
        
        // Write metafile for further analysis
        const metafilePath = path.join(distDir, 'metafile.json');
        fs.writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2));
        console.log(`📄 Metafile written to: ${metafilePath}`);
      }
    });
  }
};

// External fonts plugin - preserves absolute URLs to self-hosted fonts
const externalFontsPlugin = {
  name: 'external-fonts',
  setup(build) {
    // Mark absolute font paths as external - they'll be served from CDN
    build.onResolve({ filter: /^\/fonts\// }, args => ({
      path: args.path,
      external: true
    }));
  }
};

// Code splitting plugin for vendor libraries
const codeSplittingPlugin = {
  name: 'code-splitting',
  setup(build) {
    // Split React and ReactDOM into separate chunks for better caching
    build.onResolve({ filter: /^react$/ }, () => ({
      path: require.resolve('react'),
      namespace: 'vendor-react'
    }));
    
    build.onResolve({ filter: /^react-dom/ }, () => ({
      path: require.resolve('react-dom'),
      namespace: 'vendor-react-dom'
    }));
    
    build.onLoad({ filter: /.*/, namespace: 'vendor-react' }, () => ({
      contents: `export * from "react"; export { default } from "react";`,
      loader: 'js'
    }));
    
    build.onLoad({ filter: /.*/, namespace: 'vendor-react-dom' }, () => ({
      contents: `export * from "react-dom"; export * from "react-dom/client";`,
      loader: 'js'
    }));
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load dev config for tenant hash
let devConfig = { DEFAULT_TENANT_HASH: 'my87674d777bf9' }; // Fallback
try {
  const devConfigPath = path.join(__dirname, 'dev.config.json');
  if (fs.existsSync(devConfigPath)) {
    devConfig = JSON.parse(fs.readFileSync(devConfigPath, 'utf8'));
    console.log(`✅ Loaded dev config: ${devConfig.TENANT_NAME || 'Unknown'} (${devConfig.DEFAULT_TENANT_HASH})`);
  }
} catch (error) {
  console.warn('⚠️ Could not load dev.config.json, using fallback tenant hash');
}

// Determine build environment
const environment = process.env.BUILD_ENV || process.env.NODE_ENV || 'production';
const isServe = process.argv.includes('--serve');
const isDevelopment = isServe || environment === 'development';
const shouldAnalyze = process.env.ANALYZE === 'true';

console.log(`🏗️ ESBuild for environment: ${environment.toUpperCase()}`);
console.log(`📦 Build mode: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);

// Environment-specific configuration aligned with environment.js
const ENVIRONMENT_CONFIG = {
  development: {
    // Development uses Lambda Function URLs directly for all endpoints
    API_BASE_URL: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws',
    WIDGET_DOMAIN: 'http://localhost:8000',
    CONFIG_DOMAIN: 'https://picassostaging.s3.amazonaws.com',
    CONFIG_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=get_config',
    CHAT_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=chat',
    CONVERSATION_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=conversation',
    ERROR_REPORTING_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=log_error',
    STREAMING_ENDPOINT: 'https://7pluzq3axftklmb4gbgchfdahu0lcnqd.lambda-url.us-east-1.on.aws'
  },
  staging: {
    // Staging uses Lambda Function URLs directly for all endpoints
    API_BASE_URL: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws',
    WIDGET_DOMAIN: 'https://picassostaging.s3.amazonaws.com',
    CONFIG_DOMAIN: 'https://picassostaging.s3.amazonaws.com',
    CONFIG_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=get_config',
    CHAT_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=chat',
    CONVERSATION_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=conversation',
    ERROR_REPORTING_ENDPOINT: 'https://2ho6tw56ccvl6uvicra4f56j740dyxgo.lambda-url.us-east-1.on.aws/?action=log_error',
    STREAMING_ENDPOINT: 'https://7pluzq3axftklmb4gbgchfdahu0lcnqd.lambda-url.us-east-1.on.aws'
  },
  production: {
    // Production uses API Gateway/CloudFront for main endpoints, Lambda URLs only where needed
    API_BASE_URL: 'https://chat.myrecruiter.ai/Master_Function',
    WIDGET_DOMAIN: 'https://chat.myrecruiter.ai',
    CONFIG_DOMAIN: 'https://picassocode.s3.amazonaws.com',
    CONFIG_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=get_config',
    CHAT_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=chat',
    CONVERSATION_ENDPOINT: 'https://hfkpcekuxi3z7kllmoitt7ngae0fggxf.lambda-url.us-east-1.on.aws?action=conversation', // Lambda URL for JWT support
    ERROR_REPORTING_ENDPOINT: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    STREAMING_ENDPOINT: 'https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws'
  }
};

const envConfig = ENVIRONMENT_CONFIG[environment] || ENVIRONMENT_CONFIG.production;

// Clean and create dist directory
const distDir = `dist/${environment}`;
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy public files to environment-specific directory
// For esbuild, use the iframe-esbuild.html which loads built JS
fs.copyFileSync('public/iframe-esbuild.html', path.join(distDir, 'iframe.html'));
console.log('📋 Copied iframe-esbuild.html as iframe.html');

// Copy widget-frame.html from root if it exists
const widgetFramePath = 'widget-frame.html';
if (fs.existsSync(widgetFramePath)) {
  fs.copyFileSync(widgetFramePath, path.join(distDir, 'widget-frame.html'));
  console.log('📋 Copied widget-frame.html from root');
} else {
  console.log('⚠️ widget-frame.html not found in root directory');
}

// widget.js is now built from src/widget-standalone.js with proper environment variables
// No need to copy current-widget.js anymore

// Copy test files and service worker from public directory
const testFiles = ['test-staging.html', 'form-ui-examples.html', 'sw.js'];
testFiles.forEach(file => {
  const sourcePath = path.join('public', file);
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, path.join(distDir, file));
    console.log(`📋 Copied ${file} to dist`);
  }
});

// Copy self-hosted fonts directory
const fontsSourceDir = path.join('public', 'fonts');
const fontsDestDir = path.join(distDir, 'fonts');
if (fs.existsSync(fontsSourceDir)) {
  // Recursively copy fonts directory
  const copyDirRecursive = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };
  copyDirRecursive(fontsSourceDir, fontsDestDir);
  console.log('📋 Copied fonts directory to dist');
}

// Copy root-level test HTML files to dist for dev server access
const rootTestFiles = [
  'test-local-dev.html',
  'test-austin-angels.html',
  'test-atlanta-angels.html',
  'test-foster-village.html',
  'test-composite-fields.html',
  'test-form-completion.html',
  'test-dynamic.html'
];
rootTestFiles.forEach(file => {
  const sourcePath = path.join(__dirname, file);
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, path.join(distDir, file));
    console.log(`📋 Copied ${file} to dist (embedded widget test)`);
  }
});

// Define environment variables for React app
const defineVars = {
  // Existing environment variables
  __ENVIRONMENT__: JSON.stringify(environment),
  __API_BASE_URL__: JSON.stringify(envConfig.API_BASE_URL),
  __CONFIG_ENDPOINT__: JSON.stringify(envConfig.CONFIG_ENDPOINT || `${envConfig.API_BASE_URL}?action=get_config`),
  __CHAT_ENDPOINT__: JSON.stringify(envConfig.CHAT_ENDPOINT || `${envConfig.API_BASE_URL}?action=chat`),
  __CONVERSATION_ENDPOINT__: JSON.stringify(envConfig.CONVERSATION_ENDPOINT || `${envConfig.API_BASE_URL}?action=conversation`),
  __ERROR_REPORTING_ENDPOINT__: JSON.stringify(envConfig.ERROR_REPORTING_ENDPOINT || `${envConfig.API_BASE_URL}?action=log_error`),
  __STREAMING_ENDPOINT__: JSON.stringify(envConfig.STREAMING_ENDPOINT || ''),
  __WIDGET_DOMAIN__: JSON.stringify(envConfig.WIDGET_DOMAIN),
  __CONFIG_DOMAIN__: JSON.stringify(envConfig.CONFIG_DOMAIN),
  __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  __VERSION__: JSON.stringify(process.env.npm_package_version || '2.0.0'),
  __IS_STAGING__: JSON.stringify(environment === 'staging'),
  __DEFAULT_TENANT_HASH__: JSON.stringify(isDevelopment ? devConfig.DEFAULT_TENANT_HASH : 'my87674d777bf9'),
  __DISABLE_AUTO_DEV_MODE__: JSON.stringify(environment !== 'development'),
  
  // Vite compatibility - import.meta.env support
  'import.meta.env.DEV': JSON.stringify(isDevelopment),
  'import.meta.env.PROD': JSON.stringify(!isDevelopment),
  'import.meta.env.BASE_URL': JSON.stringify('/'),
  'import.meta.env.MODE': JSON.stringify(environment),
  'import.meta.env.VITE_BUILD_ENV': JSON.stringify(environment),
  
  // Node.js environment compatibility
  'process.env.NODE_ENV': JSON.stringify(isDevelopment ? 'development' : 'production')
};

console.log('🌐 Environment variables:', defineVars);

// Widget build options (IIFE format - no code splitting, no imports)
const widgetBuildOptions = {
  entryPoints: {
    'widget': './src/widget-host.js'  // Build widget.js from widget-host.js (iframe host)
  },
  bundle: true,
  outdir: distDir,
  format: 'iife', // IIFE format so it can be loaded as <script> tag
  globalName: 'PicassoWidget', // Required for IIFE format
  sourcemap: isDevelopment,
  minify: !isDevelopment,
  metafile: shouldAnalyze || isDevelopment,
  splitting: false, // No code splitting for widget - must be standalone
  outExtension: { '.js': '.js' }, // Ensure .js extension
  chunkNames: undefined, // Disable chunking completely

  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.jpeg': 'dataurl',
    '.gif': 'dataurl',
    '.svg': 'text',
    '.css': 'css',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file'
  },

  define: defineVars,
  logLevel: 'info',

  // Add plugins for enhanced functionality
  plugins: [
    pathAliasPlugin,
    bundleAnalyzerPlugin,
    externalFontsPlugin
  ],

  // Production optimizations (only for actual production builds)
  ...(environment === 'production' && !isDevelopment ? {
    drop: ['debugger'], // Only drop debugger - console removal breaks useEffect hooks with only console.log
    dropLabels: ['DEV'],
    legalComments: 'none',
    treeShaking: true,
    // Aggressive minification for production
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true
  } : {
    // Development optimizations
    keepNames: true
  }),

  // Target modern browsers with broader compatibility
  target: ['es2018', 'chrome64', 'firefox62', 'safari12'],

  // Platform and format settings
  platform: 'browser'
};

// Iframe build options (ESM format with code splitting)
const iframeBuildOptions = {
  entryPoints: {
    'iframe-main': './src/iframe-main.jsx'  // React app for inside the iframe
  },
  bundle: true,
  outdir: distDir,
  format: 'esm', // ESM format allows code splitting
  sourcemap: isDevelopment,
  minify: !isDevelopment,
  metafile: shouldAnalyze || isDevelopment,
  splitting: true, // Enable code splitting for better caching
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',

  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.jpeg': 'dataurl',
    '.gif': 'dataurl',
    '.svg': 'text',
    '.css': 'css',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file'
  },

  define: defineVars,
  jsx: 'automatic',
  jsxImportSource: 'react',
  logLevel: 'info',

  // Add plugins for enhanced functionality
  plugins: [
    pathAliasPlugin,
    bundleAnalyzerPlugin,
    externalFontsPlugin
  ],

  // Production optimizations (only for actual production builds)
  ...(environment === 'production' && !isDevelopment ? {
    drop: ['debugger'], // Only drop debugger - console removal breaks useEffect hooks with only console.log
    dropLabels: ['DEV'],
    legalComments: 'none',
    treeShaking: true,
    // Aggressive minification for production
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true
  } : {
    // Development optimizations
    keepNames: true
  }),

  // External dependencies for better caching (production only)
  ...(environment === 'production' ? {
    external: []
  } : {}),

  // Target modern browsers with broader compatibility
  target: ['es2018', 'chrome64', 'firefox62', 'safari12'],

  // Platform and format settings
  platform: 'browser',
  conditions: ['import', 'module', 'browser']
};

if (isServe) {
  // Development server mode - build both widget and iframe
  console.log('🔧 Building widget (IIFE)...');
  await esbuild.build(widgetBuildOptions);

  console.log('🔧 Building iframe (ESM)...');
  const ctx = await esbuild.context(iframeBuildOptions);
  await ctx.watch();

  const { host, port } = await ctx.serve({
    servedir: distDir,
    port: 8000,
    host: '0.0.0.0',
    fallback: path.join(distDir, 'iframe.html') // SPA fallback
  });

  console.log(`
🚀 esbuild dev server running at:
   Local:   http://localhost:${port}
   Network: http://${host}:${port}
   Environment: ${environment.toUpperCase()}
   Output directory: ${distDir}

   Path aliases configured:
   📁 @ → src/
   📁 @components → src/components/
   📁 @utils → src/utils/
   📁 @styles → src/styles/
   📁 @config → src/config/

   💡 Use ANALYZE=true to enable bundle analysis
  `);
} else {
  // Production build - build both widget and iframe separately
  console.log(`🔨 Building for ${environment.toUpperCase()} environment...`);

  const startTime = Date.now();

  // Build widget first (IIFE format, no imports)
  console.log('📦 Building widget.js (IIFE format)...');
  const widgetResult = await esbuild.build(widgetBuildOptions);

  // Build iframe app (ESM format with code splitting)
  console.log('📦 Building iframe-main.js (ESM format with code splitting)...');
  const iframeResult = await esbuild.build(iframeBuildOptions);

  const buildTime = Date.now() - startTime;

  // Combine results for reporting
  const result = {
    metafile: {
      outputs: {
        ...(widgetResult.metafile?.outputs || {}),
        ...(iframeResult.metafile?.outputs || {})
      }
    }
  };
  
  console.log(`✅ Build complete! Output: ${distDir}`);
  console.log(`⏱️  Build time: ${buildTime}ms`);
  
  // Show build summary
  if (result.metafile) {
    const outputs = result.metafile.outputs;
    const totalSize = Object.values(outputs).reduce((sum, output) => sum + output.bytes, 0);
    console.log(`📦 Total bundle size: ${(totalSize / 1024).toFixed(2)} KB`);
    
    // List main output files
    Object.entries(outputs).forEach(([file, output]) => {
      if (!file.includes('chunk') && !file.includes('assets/')) {
        const sizeKB = (output.bytes / 1024).toFixed(2);
        console.log(`   📄 ${path.basename(file)}: ${sizeKB} KB`);
      }
    });
    
    if (shouldAnalyze) {
      console.log(`\n📊 Run with ANALYZE=true for detailed bundle analysis`);
    }
  }
  
  // Performance recommendations
  if (result.metafile && !shouldAnalyze) {
    const outputs = result.metafile.outputs;
    const largeChunks = Object.entries(outputs).filter(([, output]) => output.bytes > 150 * 1024);
    if (largeChunks.length > 0) {
      console.log(`\n⚠️  Large chunks detected. Run with ANALYZE=true for detailed analysis:`);
      largeChunks.forEach(([file, output]) => {
        console.log(`   ${path.basename(file)}: ${(output.bytes / 1024).toFixed(2)} KB`);
      });
    }
  }
}