# Picasso Widget Simplification Proposal

## Current Problems
1. **Overly complex tenant detection** - Multiple fallback methods that don't work in iframe context
2. **Configuration loading issues** - Iframe can't find script tags from parent page
3. **Build complexity** - Vite not properly injecting assets without manual script tags
4. **Too many moving parts** - Making debugging and deployment difficult
5. **Developer experience nightmare** - Hours wasted getting basic test pages to work

## Proposed Simplification

### 1. Single Source of Truth for Tenant
```javascript
// In iframe context, ONLY use URL parameter
const getTenantHash = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('t') || 'default';
};
```

### 2. Developer-First Configuration
Instead of hardcoding tenants, provide development presets:

```javascript
// config/defaults.js
export const PICASSO_DEFAULT = {
  name: 'Picasso',
  primaryColor: '#6366f1',
  headerText: 'How can we help you today?',
  // Professional Picasso branding as default
};

// config/dev-presets.js (development only)
export const DEV_PRESETS = {
  dark: { /* dark mode testing */ },
  minimal: { /* minimal UI testing */ },
  colorful: { /* vibrant theme testing */ }
};

// Always fetch real tenant configs from API
const config = await fetchFromAPI(tenantHash) || PICASSO_DEFAULT;
```

### 3. Simplify Widget.js
```javascript
// Just create iframe with tenant parameter
const iframe = document.createElement('iframe');
iframe.src = `${WIDGET_URL}/widget-frame.html?t=${tenantHash}`;
// That's it!
```

### 4. Better Development Experience
- Single `npm run dev` command that works every time
- Developer control panel for feature testing
- Hot reload that doesn't break the widget
- Clear console messages about what's happening
- Test page at http://localhost:5173/dev that ALWAYS works

## Benefits
1. **Predictable** - Same code path every time
2. **Debuggable** - Clear flow from script → iframe → config
3. **Multi-tenant** - No hardcoded clients, pure SaaS platform
4. **Developer-friendly** - Focus on features, not configuration
5. **Fast** - Instant loading with Picasso defaults
6. **Simple** - Less code = fewer bugs

## Implementation Steps
1. Simplify ConfigProvider to only use URL params in iframe
2. Create Picasso default theme configuration
3. Build developer control panel for testing
4. Remove complex fallback logic
5. Add clear debug logging
6. Create dev test page that always works

This would make deployment as simple as:
```bash
npm run build
npm run deploy:staging
# Done!
```

No more hunting for why configs aren't loading!