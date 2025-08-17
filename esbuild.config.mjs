import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Clean dist directory
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true });
}
fs.mkdirSync('dist', { recursive: true });

// Copy public files
// For esbuild, use the iframe-esbuild.html which loads built JS
fs.copyFileSync('public/iframe-esbuild.html', 'dist/iframe.html');
console.log('📋 Copied iframe-esbuild.html as iframe.html');

const publicFiles = ['widget-frame.html'];
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
    '__ENVIRONMENT__': '"staging"',
    '__API_BASE_URL__': '"https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws"',
    '__CONFIG_ENDPOINT__': '"https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=get_config"',
    '__CHAT_ENDPOINT__': '"https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=chat"',
    '__CONVERSATION_ENDPOINT__': '"https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=conversation"',
    '__ERROR_REPORTING_ENDPOINT__': '"https://ylhilrvv7fbyfbtslvtxfya6va0zfhhx.lambda-url.us-east-1.on.aws/?action=log_error"',
    '__WIDGET_DOMAIN__': '"http://localhost:8000"',
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
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  
  const { host, port } = await ctx.serve({
    servedir: 'dist',
    port: 8000,
    host: '0.0.0.0'
  });
  
  console.log(`
🚀 esbuild dev server running at:
   Local:   http://localhost:${port}
   Network: http://${host}:${port}
  `);
} else {
  // Production build
  await esbuild.build(buildOptions);
  console.log('✅ Build complete!');
}