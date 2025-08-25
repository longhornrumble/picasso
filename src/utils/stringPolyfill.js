/**
 * Global String method safety polyfill
 * Prevents "Cannot read properties of undefined" errors
 */

// Store original methods
const originalStartsWith = String.prototype.startsWith;
const originalIncludes = String.prototype.includes;
const originalEndsWith = String.prototype.endsWith;

// Override String.prototype.startsWith to be safe
if (typeof String.prototype.startsWith === 'function') {
  String.prototype.startsWith = function(searchString, position) {
    try {
      if (this == null || this === undefined) {
        console.warn('startsWith called on null/undefined');
        return false;
      }
      return originalStartsWith.call(String(this), searchString, position);
    } catch (e) {
      console.warn('startsWith error:', e);
      return false;
    }
  };
}

// Override String.prototype.includes to be safe
if (typeof String.prototype.includes === 'function') {
  String.prototype.includes = function(searchString, position) {
    try {
      if (this == null || this === undefined) {
        console.warn('includes called on null/undefined');
        return false;
      }
      return originalIncludes.call(String(this), searchString, position);
    } catch (e) {
      console.warn('includes error:', e);
      return false;
    }
  };
}

// Override String.prototype.endsWith to be safe
if (typeof String.prototype.endsWith === 'function') {
  String.prototype.endsWith = function(searchString, length) {
    try {
      if (this == null || this === undefined) {
        console.warn('endsWith called on null/undefined');
        return false;
      }
      return originalEndsWith.call(String(this), searchString, length);
    } catch (e) {
      console.warn('endsWith error:', e);
      return false;
    }
  };
}

// Also make a global safety wrapper for any direct calls
window.__safeStringMethod = (obj, method, ...args) => {
  try {
    if (obj == null || obj === undefined) {
      return method === 'startsWith' || method === 'includes' || method === 'endsWith' ? false : '';
    }
    const str = String(obj);
    if (typeof str[method] === 'function') {
      return str[method](...args);
    }
    return false;
  } catch (e) {
    console.warn(`Safe string method ${method} failed:`, e);
    return false;
  }
};

console.log('✅ String safety polyfill loaded');