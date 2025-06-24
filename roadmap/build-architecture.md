# Unified Build Pipeline Architecture

## Problem Statement

The current build system has critical issues:
1. **Hardcoded ports** (5173, 5174) that break in different environments
2. **No single source of truth** for file locations
3. **Manual file copying** required (current-widget.js → dist/widget.js)
4. **Path fixing scripts** needed for staging
5. **Widget can't find assets** in different environments

## Root Cause: Static Configuration in Dynamic Environment

The widget hardcodes:
- Development port: 5173 (was 5174)
- Production domain: https://chat.myrecruiter.ai
- Staging paths: /staging/

But reality is:
- Dev servers run on random ports
- Multiple staging environments exist
- Local development varies by developer
- CI/CD environments differ

## Solution: Dynamic Origin Detection

### Phase 1: Dynamic Widget Loading (COMPLETED)
```javascript
// OLD - Hardcoded ports
if (devMode) {
  widgetDomain = `http://localhost:5173`;
}

// NEW - Dynamic detection
const scriptElement = document.currentScript;
const scriptUrl = new URL(scriptElement.src);
widgetDomain = scriptUrl.origin;
```

Benefits:
- Works on ANY port
- Works in ANY environment
- No configuration needed

### Phase 2: Unified Build Entry Points

Currently we have:
- `current-widget.js` (source)
- `public/widget.js` (dev copy)
- `dist/widget.js` (build copy)
- Multiple entry points in vite.config.js

Proposed structure:
```
src/
  widget/
    widget.js         # Single source
    widget-frame.html # Iframe HTML
    fullpage.html     # Full page mode
    
vite.config.js:
  build: {
    rollupOptions: {
      input: {
        widget: 'src/widget/widget.js',
        iframe: 'src/widget/widget-frame.html',
        fullpage: 'src/widget/fullpage.html'
      }
    }
  }
```

### Phase 3: Environment-Agnostic Paths

Replace ALL absolute paths with relative or dynamic:

```javascript
// Bad
const assetUrl = '/assets/logo.png';

// Good
const assetUrl = new URL('./assets/logo.png', import.meta.url).href;

// Or for runtime assets
const baseUrl = document.currentScript.src.replace(/[^/]*$/, '');
const assetUrl = baseUrl + 'assets/logo.png';
```

### Phase 4: Build Output Structure

Standardize output for all environments:
```
dist/
  widget.js           # Host script
  widget-frame.html   # Iframe HTML
  fullpage.html       # Full page mode
  assets/
    *.js             # Hashed assets
    *.css            # Hashed styles
```

No more:
- widget-frame-staging.html
- fix-staging-paths.js
- Manual copying

### Phase 5: Deployment Simplification

Single deployment command:
```bash
npm run build
aws s3 sync dist/ s3://bucket/path/
```

The widget auto-detects its environment from its own URL.

## Implementation Checklist

- [x] Dynamic origin detection in widget.js
- [ ] Consolidate widget.js sources
- [ ] Update vite.config.js for unified entry points
- [ ] Replace all hardcoded paths
- [ ] Remove staging-specific HTML files
- [ ] Remove path-fixing scripts
- [ ] Update deployment scripts
- [ ] Test in all environments

## Success Metrics

1. **Zero configuration** - Widget works everywhere without changes
2. **Single build** - One build works in dev/staging/production
3. **No manual steps** - Build → Deploy, nothing else
4. **Self-contained** - Widget discovers its own context

## Migration Path

1. **Immediate fix** (DONE): Dynamic origin detection
2. **Next sprint**: Consolidate entry points
3. **Following sprint**: Remove all hardcoded paths
4. **Final sprint**: Clean up legacy files

## Long-term Vision

The widget becomes truly portable:
- Drop on any domain
- Works on any port
- No configuration needed
- Full isolation from host page

This enables:
- White-label deployments
- Partner integrations
- Local development
- CI/CD testing

All without changing a single line of code.