#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the widget-frame.html
const htmlPath = path.join(__dirname, 'dist/widget-frame.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace absolute paths with staging paths
html = html.replace(/src="\/assets\//g, 'src="/staging/assets/');
html = html.replace(/href="\/assets\//g, 'href="/staging/assets/');

// Create staging version
const stagingHtmlPath = path.join(__dirname, 'dist/widget-frame-staging.html');
fs.writeFileSync(stagingHtmlPath, html);

console.log('✅ Created widget-frame-staging.html with /staging/ paths');

// Also create a version that detects staging dynamically
const dynamicHtml = fs.readFileSync(htmlPath, 'utf8');
const scriptToInsert = `
    <script>
      // Detect if we're in staging and adjust asset paths
      (function() {
        const isStaging = window.location.pathname.includes('/staging/');
        if (isStaging) {
          // Update all asset links to include /staging prefix
          document.querySelectorAll('link[href^="/assets/"], script[src^="/assets/"]').forEach(el => {
            if (el.href) el.href = el.href.replace('/assets/', '/staging/assets/');
            if (el.src) el.src = el.src.replace('/assets/', '/staging/assets/');
          });
        }
      })();
    </script>
`;

// Insert the script before the closing head tag
const dynamicHtmlWithScript = dynamicHtml.replace('</head>', scriptToInsert + '\n  </head>');
fs.writeFileSync(htmlPath, dynamicHtmlWithScript);

console.log('✅ Updated widget-frame.html with dynamic staging detection');