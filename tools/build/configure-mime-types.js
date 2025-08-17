#!/usr/bin/env node

// scripts/configure-mime-types.js - Ensure proper MIME types for S3
import { execSync } from 'child_process';

const files = [
  { pattern: '*.js', contentType: 'application/javascript' },
  { pattern: '*.css', contentType: 'text/css' },
  { pattern: '*.html', contentType: 'text/html' },
  { pattern: '*.json', contentType: 'application/json' },
  { pattern: '*.svg', contentType: 'image/svg+xml' },
  { pattern: '*.woff2', contentType: 'font/woff2' },
  { pattern: '*.ttf', contentType: 'font/ttf' },
  { pattern: '*.png', contentType: 'image/png' }
];

function setMimeTypes(bucket) {
  console.log(` Setting MIME types for bucket: ${bucket}`);

  files.forEach(({ pattern, contentType }) => {
    try {
      execSync(`aws s3 cp s3://${bucket}/ s3://${bucket}/ \
        --recursive \
        --exclude "*" \
        --include "${pattern}" \
        --content-type "${contentType}" \
        --metadata-directive REPLACE`, {
        encoding: 'utf8'
      });
      console.log(` Set ${contentType} for ${pattern}`);
    } catch (error) {
      console.warn(`️ Failed to set MIME type for ${pattern}:`, error.message);
    }
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bucket = process.argv[2];
  if (!bucket) {
    console.error('Usage: node configure-mime-types.js <bucket-name>');
    process.exit(1);
  }
  setMimeTypes(bucket);
}

export { setMimeTypes };