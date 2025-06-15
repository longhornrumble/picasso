// scripts/rename-css.js
import fs from 'fs';
import path from 'path';

const distPath = './dist/assets';
const files = fs.readdirSync(distPath);

const cssFile = files.find(f => f.startsWith('widget') && f.endsWith('.css'));

if (cssFile) {
  fs.renameSync(path.join(distPath, cssFile), path.join('./dist', 'widget.css'));
  console.log(`✅ widget.css renamed from ${cssFile}`);
} else {
  console.warn('⚠️ widget.css not found in dist/assets');
}