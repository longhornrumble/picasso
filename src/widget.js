// src/widget.js - Production Widget Entry Point (FIXED)
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/theme.css';

// Browser polyfills (CRITICAL: Fixes "process is not defined" error)
if (typeof window !== 'undefined') {
  if (typeof window.process === 'undefined') {
    window.process = { 
      env: { NODE_ENV: 'production' },
      browser: true
    };
  }
  if (typeof window.global === 'undefined') {
    window.global = window;
  }
}

/**
 * Production-ready Picasso Widget
 * Embeddable via: <script src="https://chat.myrecruiter.ai/widget.js" data-tenant="HASH"></script>
 */

class PicassoWidget {
  constructor() {
    this.mounted = false;
    this.root = null;
    this.container = null;
    this.tenantId = null;
    this.config = null;
  }

  // Extract tenant ID and mode from script tag or URL
  getTenantId() {
    try {
      // Priority 1: data-tenant attribute on script tag
      const script = document.currentScript || 
                    document.querySelector('script[src*="widget.js"]') ||
                    document.querySelector('script[data-tenant]');
      
      if (script?.getAttribute('data-tenant')) {
        return script.getAttribute('data-tenant');
      }

      // Priority 2: URL parameter (for testing and full-page mode)
      const urlParams = new URLSearchParams(window.location.search);
      const tenantFromUrl = urlParams.get('tenant') || urlParams.get('t');
      
      if (tenantFromUrl) {
        return tenantFromUrl;
      }

      // Priority 3: Global variable (backup)
      if (typeof window !== 'undefined' && window.PICASSO_TENANT_ID) {
        return window.PICASSO_TENANT_ID;
      }

      console.warn('⚠️ No tenant ID found. Using development fallback.');
      return 'Rm9zNDAy'; // Development fallback hash

    } catch (error) {
      console.error('❌ Error getting tenant ID:', error);
      return 'Rm9zNDAy'; // Fallback
    }
  }

  // Detect rendering mode
  getMode() {
    try {
      // Priority 1: URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const modeFromUrl = urlParams.get('mode');
      if (modeFromUrl) return modeFromUrl;

      // Priority 2: Script data attribute
      const script = document.currentScript || 
                    document.querySelector('script[src*="widget.js"]');
      const modeFromScript = script?.getAttribute('data-mode');
      if (modeFromScript) return modeFromScript;

      // Priority 3: Check if we're on a dedicated page (no other content)
      const bodyContent = document.body.innerText.trim();
      const hasMinimalContent = bodyContent.length < 100;
      if (hasMinimalContent) return 'fullpage';

      // Default: embedded widget
      return 'widget';

    } catch (error) {
      console.warn('⚠️ Error detecting mode, using widget mode:', error);
      return 'widget';
    }
  }

  // Create widget container
  createContainer() {
    try {
      const mode = this.getMode();
      
      if (mode === 'fullpage') {
        // Full-page mode: use existing root or body
        let container = document.getElementById('root') || document.getElementById('picasso-fullpage-root');
        
        if (!container) {
          container = document.createElement('div');
          container.id = 'picasso-fullpage-root';
          container.style.width = '100vw';
          container.style.height = '100vh';
          container.style.position = 'fixed';
          container.style.top = '0';
          container.style.left = '0';
          container.style.zIndex = '999999';
          container.style.background = 'var(--picasso-fullpage-background, #f8fafc)';
          
          // Clear existing page content for clean full-page experience
          document.body.innerHTML = '';
          document.body.appendChild(container);
        }
        
        return container;
      } else {
        // Widget mode: floating container
        let container = document.getElementById('picasso-widget-root');
        
        if (!container) {
          container = document.createElement('div');
          container.id = 'picasso-widget-root';
          container.style.position = 'fixed';
          container.style.zIndex = '999999';
          container.style.pointerEvents = 'none'; // Allow clicks through when closed
          
          document.body.appendChild(container);
        }

        return container;
      }
    } catch (error) {
      console.error('❌ Error creating container:', error);
      // Fallback container
      const fallback = document.createElement('div');
      fallback.id = 'picasso-widget-fallback';
      document.body.appendChild(fallback);
      return fallback;
    }
  }

  // Initialize the widget
  async init() {
    try {
      // Prevent double initialization
      if (this.mounted || window.__picassoWidgetMounted) {
        console.warn('⚠️ Picasso widget already mounted');
        return;
      }

      // Get tenant ID and mode
      this.tenantId = this.getTenantId();
      this.mode = this.getMode();
      console.info(`🚀 Initializing Picasso Widget for tenant: ${this.tenantId || 'unknown'} in ${this.mode} mode`);

      // Create container
      this.container = this.createContainer();

      // Set global config for React app
      window.PicassoConfig = {
        tenant: this.tenantId,
        mode: this.mode,
        embedded: this.mode === 'widget',
        fullpage: this.mode === 'fullpage',
        widget: this.mode === 'widget'
      };

      console.info('🎯 PicassoConfig set:', window.PicassoConfig);

      // Create React root and render
      this.root = createRoot(this.container);
      this.root.render(React.createElement(App));

      // Mark as mounted
      this.mounted = true;
      window.__picassoWidgetMounted = true;
      window.__picassoWidget = this;

      console.info('✅ Picasso Widget mounted successfully');

      // Optional: Dispatch custom event for integrations
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('picasso:mounted', {
          detail: { tenantId: this.tenantId }
        }));
      }

    } catch (error) {
      console.error('❌ Failed to initialize Picasso Widget:', error);
      
      // Show fallback UI
      this.showFallback(error);
    }
  }

  // Fallback UI for errors
  showFallback(error) {
    try {
      if (!this.container) {
        this.container = this.createContainer();
      }

      this.container.innerHTML = `
        <div style="
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: #ef4444;
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          font-family: system-ui, sans-serif;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 999999;
          max-width: 300px;
        ">
          <strong>Chat Widget Error</strong><br>
          <small>Please refresh the page or contact support</small>
          <button onclick="this.parentElement.remove()" style="
            position: absolute;
            top: 4px;
            right: 4px;
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 16px;
          ">×</button>
        </div>
      `;

      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (this.container?.innerHTML) {
          this.container.innerHTML = '';
        }
      }, 10000);

    } catch (fallbackError) {
      console.error('❌ Even fallback failed:', fallbackError);
    }
  }

  // Cleanup method
  destroy() {
    try {
      if (this.root) {
        this.root.unmount();
        this.root = null;
      }
      
      if (this.container) {
        this.container.remove();
        this.container = null;
      }

      this.mounted = false;
      window.__picassoWidgetMounted = false;
      delete window.__picassoWidget;

      console.info('🧹 Picasso Widget destroyed');

    } catch (error) {
      console.error('❌ Error destroying widget:', error);
    }
  }
}

// Auto-initialize when DOM is ready
function initializeWidget() {
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        const widget = new PicassoWidget();
        widget.init();
      });
    } else {
      // DOM already ready
      const widget = new PicassoWidget();
      widget.init();
    }
  } catch (error) {
    console.error('❌ Widget initialization failed:', error);
  }
}

// Global API for manual control
if (typeof window !== 'undefined') {
  window.Picasso = {
    init: () => {
      const widget = new PicassoWidget();
      return widget.init();
    },
    destroy: () => {
      if (window.__picassoWidget) {
        window.__picassoWidget.destroy();
      }
    },
    isLoaded: () => !!window.__picassoWidgetMounted,
    version: '1.0.0' // Remove __APP_VERSION__ reference that causes build issues
  };
}

// Auto-initialize unless disabled
if (typeof window !== 'undefined' && !window.PICASSO_MANUAL_INIT) {
  initializeWidget();
}

export default PicassoWidget;