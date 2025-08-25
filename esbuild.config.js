const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Clean dist directory
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true });
}
fs.mkdirSync('dist', { recursive: true });

// Copy public files
const publicFiles = ['iframe.html', 'widget-frame.html'];
publicFiles.forEach(file => {
  const srcPath = path.join('public', file);
  const destPath = path.join('dist', file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`📋 Copied ${file}`);
  }
});

// Copy current-widget.js as widget.js
fs.copyFileSync('current-widget.js', 'dist/widget.js');
console.log('📋 Copied current-widget.js as widget.js');

// Development server
const serve = process.argv.includes('--serve');

const buildOptions = {
  entryPoints: {
    'widget-standalone': './src/widget-standalone.js',
    'iframe-main': './src/iframe-main.jsx'
  },
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  sourcemap: serve,
  minify: !serve,
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.svg': 'text',
    '.css': 'css'
  },
  define: {
    '__ENVIRONMENT__': serve ? '"development"' : '"production"',
    '__API_BASE_URL__': serve ? '"http://localhost:3000/api"' : '"https://chat.myrecruiter.ai"',
    '__WIDGET_DOMAIN__': serve ? '"http://localhost:8000"' : '"https://chat.myrecruiter.ai"',
    '__CONFIG_DOMAIN__': '"https://picasso-staging.s3.amazonaws.com"',
    '__BUILD_TIME__': `"${new Date().toISOString()}"`,
    '__VERSION__': '"2.0.0"'
  },
  jsx: 'automatic',
  jsxImportSource: 'react',
  logLevel: 'info'
};

if (serve) {
  // Development server mode
  esbuild.serve(
    {
      servedir: 'dist',
      port: 8000,
      host: '0.0.0.0'
    },
    buildOptions
  ).then(server => {
    console.log(`
🚀 esbuild dev server running at:
   Local:   http://localhost:${server.port}
   Network: http://0.0.0.0:${server.port}
    `);
  }).catch(() => process.exit(1));
} else {
  // Production build
  esbuild.build(buildOptions)
    .then(() => {
      console.log('✅ Build complete!');
    })
    .catch(() => process.exit(1));
}