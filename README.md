# Picasso Widget - Iframe Architecture

A robust, iframe-based chat widget with complete CSS isolation for MyRecruiter SaaS platform.

## 🎯 Features

- **Complete CSS Isolation**: Iframe-based architecture prevents host page styling conflicts
- **Multi-tenant Support**: Hash-based tenant configuration system
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Performance Optimized**: Sub-500ms iframe load, sub-200ms config load
- **Feature Complete**: Action chips, quick help, file uploads, callout notifications, markdown rendering

## 🚀 Quick Start

### Basic Embedding

```html
<!-- Single script tag embedding -->
<script src="https://chat.myrecruiter.ai/widget.js" data-tenant="YOUR_TENANT_HASH"></script>
```

### Advanced Usage

```javascript
// Manual initialization with configuration
PicassoWidget.init('YOUR_TENANT_HASH', {
  expandedWidth: '400px',
  expandedHeight: '700px',
  position: 'bottom-left'
});

// Control widget state
PicassoWidget.open();
PicassoWidget.close();
PicassoWidget.toggle();

// Listen for events
PicassoWidget.onEvent((event) => {
  console.log('Widget event:', event.event, event.payload);
});

// Update configuration dynamically
PicassoWidget.updateConfig({
  theme: { primary_color: '#ff6b6b' }
});
```

## 📐 Widget Sizing

### Desktop
- **Minimized**: 56x56px (bottom-right positioned)
- **Expanded**: 360x640px (configurable)

### Mobile
- **Expanded**: Near-fullscreen overlay (calc(100vw - 20px) x calc(100vh - 20px))
- **Automatic detection**: Based on viewport width ≤ 768px

### Tablet
- **Expanded**: 480px x calc(100vh - 40px)
- **Detection**: Viewport width 769px - 1024px

## 🔌 API Reference

### Initialization
```javascript
PicassoWidget.init(tenantHash, config)
```

### State Control
```javascript
PicassoWidget.open()      // Open chat widget
PicassoWidget.close()     // Close chat widget  
PicassoWidget.toggle()    // Toggle open/closed state
PicassoWidget.isOpen()    // Check if widget is open
PicassoWidget.isLoaded()  // Check if widget is loaded
```

### Configuration
```javascript
PicassoWidget.updateConfig(newConfig)  // Update widget configuration
```

### Events
```javascript
PicassoWidget.onEvent(callback)  // Listen for widget events
```

### Events Emitted
- `CHAT_OPENED`: User opened the chat widget
- `CHAT_CLOSED`: User closed the chat widget
- `MESSAGE_SENT`: User sent a message
- `RESIZE_REQUEST`: Widget requests size change

## 🔧 Development

### Setup
```bash
npm install
npm run dev
```

### Build
```bash
npm run build        # Build for production
npm run build:all    # Build all variants
```

### Testing
- `public/test-iframe.html` - Basic iframe functionality
- `public/size-test.html` - Responsive sizing tests
- `public/harsh-css-test.html` - CSS isolation stress test

## 📦 File Structure

```
dist/
├── widget.js              # Host page injection script
├── widget-frame.html      # Iframe entry point
├── iframe-main.js         # Iframe React application
├── assets/                # CSS and other assets
└── tenants/              # Configuration files
```

## 🔀 Migration Guide

### From Shadow DOM to Iframe

**Before** (Shadow DOM):
```html
<script src="widget.js" data-tenant="hash"></script>
```

**After** (Iframe - No changes needed!):
```html
<script src="widget.js" data-tenant="hash"></script>
```

The iframe implementation is fully backward compatible. Existing embeddings will automatically use the new iframe architecture.

### API Migration

Most APIs remain the same. Key improvements:

```javascript
// Enhanced event handling
PicassoWidget.onEvent((event) => {
  switch (event.event) {
    case 'CHAT_OPENED':
      // Track analytics
      break;
    case 'MESSAGE_SENT':
      // Track engagement
      break;
  }
});
```

## 🎨 CSS Isolation

The iframe architecture provides complete CSS isolation:

- ✅ Host page CSS cannot affect widget styling
- ✅ Widget CSS cannot affect host page
- ✅ Works with any CSS framework (Bootstrap, Tailwind, etc.)
- ✅ Handles aggressive CSS resets and !important declarations

## 📱 Mobile Optimization

- **Near-fullscreen overlay** on mobile devices
- **Safe area margins** to avoid notches and status bars
- **Automatic responsive detection**
- **Touch-optimized interactions**

## 🔒 Security

- **Iframe sandbox**: Appropriate restrictions while enabling functionality
- **Hash-based security**: No tenant IDs exposed in URLs
- **CORS compliance**: Maintains existing CloudFront security policies

## 📊 Performance

- **Iframe Load**: < 500ms target (monitored and logged)
- **Config Load**: < 200ms target (with caching)
- **Memory Efficient**: Minimal overhead vs Shadow DOM approach
- **Caching**: 5-minute config cache for performance

## 🔍 Debugging

Enable console logging to see detailed performance and event information:

```javascript
// Check iframe load performance
// Look for "⚡ Iframe loaded in XXXms" messages

// Check configuration load performance  
// Look for "⚡ Config fetched in XXXms" messages

// Monitor events
PicassoWidget.onEvent(console.log);
```

## 🛠️ Browser Support

- **Chrome**: 90+
- **Firefox**: 88+  
- **Safari**: 14+
- **Edge**: 90+
- **Mobile**: iOS Safari, Android Chrome

## 📄 License

Proprietary - MyRecruiter SaaS Platform 