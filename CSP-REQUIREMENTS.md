# Content Security Policy (CSP) Requirements for Picasso Widget

## Overview

The Picasso chat widget is designed to work with strict Content Security Policy (CSP) headers. This document outlines the CSP requirements for customers integrating the widget into their applications.

## Required CSP Directives

To ensure the Picasso widget functions correctly, add the following directives to your CSP header:

### 1. Script Source (`script-src`)
```
script-src 'self' https://chat.myrecruiter.ai https://*.myrecruiter.ai;
```

### 2. Frame Source (`frame-src`)
```
frame-src 'self' https://chat.myrecruiter.ai;
```

### 3. Connect Source (`connect-src`)
```
connect-src 'self' https://api.myrecruiter.ai https://chat.myrecruiter.ai;
```

### 4. Style Source (`style-src`)
```
style-src 'self' 'unsafe-inline' https://chat.myrecruiter.ai;
```
Note: 'unsafe-inline' is required for the widget's dynamic styling.

### 5. Image Source (`img-src`)
```
img-src 'self' data: https: blob: https://chat.myrecruiter.ai https://*.myrecruiter.ai;
```

### 6. Font Source (`font-src`)
```
font-src 'self' data: https://chat.myrecruiter.ai;
```

## Complete CSP Header Example

Here's a complete example of a CSP header that supports the Picasso widget:

```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' https://chat.myrecruiter.ai https://*.myrecruiter.ai;
  style-src 'self' 'unsafe-inline' https://chat.myrecruiter.ai;
  img-src 'self' data: https: blob: https://chat.myrecruiter.ai https://*.myrecruiter.ai;
  font-src 'self' data: https://chat.myrecruiter.ai;
  connect-src 'self' https://api.myrecruiter.ai https://chat.myrecruiter.ai;
  frame-src 'self' https://chat.myrecruiter.ai;
  frame-ancestors 'self';
  base-uri 'self';
  form-action 'self';
```

## Security Considerations

1. **Origin Validation**: The widget implements strict origin validation for all postMessage communications. Only messages from allowed origins are processed.

2. **Iframe Sandboxing**: The widget iframe runs with appropriate sandbox attributes to isolate it from the parent page.

3. **XSS Protection**: All user-generated content is sanitized using DOMPurify before rendering.

4. **HTTPS Only**: In production, the widget only loads over HTTPS to prevent man-in-the-middle attacks.

## Development Mode

For local development, you may need to adjust your CSP to allow localhost:

```
script-src 'self' https://chat.myrecruiter.ai http://localhost:5173 http://localhost:5174;
frame-src 'self' https://chat.myrecruiter.ai http://localhost:5174;
connect-src 'self' https://api.myrecruiter.ai http://localhost:5173 http://localhost:5174;
```

## Testing Your CSP

1. Open your browser's developer console
2. Load a page with the Picasso widget
3. Check for any CSP violation errors in the console
4. Adjust your CSP directives as needed

## Support

If you encounter any CSP-related issues with the Picasso widget, please contact support@myrecruiter.ai with:
- Your current CSP header
- Any console errors you're seeing
- The tenant hash you're using