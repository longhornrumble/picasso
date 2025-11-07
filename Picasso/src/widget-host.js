/**
 * Picasso Widget Host Script
 * Creates iframe with complete CSS isolation for the chat widget
 * Uses your existing React app, theme.css, and useCSSVariables system
 */

import { config as environmentConfig } from './config/environment.js';

(function() {
  'use strict';
  
  const PicassoWidget = {
    iframe: null,
    container: null,
    isOpen: false,
    tenantHash: null,
    config: {
      // Default configuration - will be overridden by tenant config
      position: 'bottom-right',
      minimizedSize: '56px',
      expandedWidth: '360px',
      expandedHeight: '640px',
      zIndex: 10000
    },
    
    // Initialize the widget
    init(tenantHash, customConfig = {}) {
      if (!tenantHash) {
        console.error('Picasso Widget: Tenant hash is required');
        return;
      }
      
      this.tenantHash = tenantHash;
      this.config = { ...this.config, ...customConfig };
      
      console.log('🚀 Initializing Picasso Widget:', tenantHash);
      
      this.createContainer();
      this.createIframe();
      this.setupEventListeners();
      this.setupResizeObserver();
    },
    
    // Create the widget container with positioning
    createContainer() {
      this.container = document.createElement('div');
      this.container.id = 'picasso-widget-container';

      // Apply positioning styles - NO theme styles, just functional positioning
      Object.assign(this.container.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: this.config.zIndex,
        width: this.config.minimizedSize,
        height: this.config.minimizedSize,
        transition: 'all 0.3s ease',
        pointerEvents: 'auto'
      });

      document.body.appendChild(this.container);
    },
    
    // Create the iframe with your React app
    createIframe() {
      this.iframe = document.createElement('iframe');

      // Determine the correct domain based on explicit development mode
      // Check for development mode via data attribute or URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const urlParamDev = urlParams.get('picasso-dev') === 'true';

      // For module scripts, document.currentScript is null, so we need to find the script differently
      const allScripts = Array.from(document.querySelectorAll('script[data-tenant]'));
      const widgetScript = allScripts.find(s =>
        s.src.includes('widget.js') ||
        s.getAttribute('type') === 'module'
      );
      const scriptDataDev = widgetScript?.getAttribute('data-dev') === 'true';

      const explicitDevMode = urlParamDev || scriptDataDev;

      // Debug logging
      console.log('🔍 Dev mode detection:', {
        urlParamDev,
        scriptDataDev,
        scriptFound: !!widgetScript,
        scriptSrc: widgetScript?.src,
        explicitDevMode,
        hostname: window.location.hostname
      });

      // Respect build-time dev mode override for staging/production builds
      const autoDevModeDisabled = typeof __DISABLE_AUTO_DEV_MODE__ !== 'undefined' && __DISABLE_AUTO_DEV_MODE__;
      const devMode = explicitDevMode || (!autoDevModeDisabled && ['localhost', '127.0.0.1'].includes(window.location.hostname));

      const isLocal = devMode;

      console.log('🔧 Final devMode:', devMode, '| isLocal:', isLocal);
      
      // Use build-time widget domain override for staging builds
      let widgetDomain;
      if (devMode) {
        widgetDomain = `http://localhost:8000`;
      } else if (typeof __WIDGET_DOMAIN__ !== 'undefined' && __WIDGET_DOMAIN__ === 'CURRENT_DOMAIN') {
        widgetDomain = window.location.origin;
        console.log('🎯 Using current domain for staging build:', widgetDomain);
      } else if (typeof __WIDGET_DOMAIN__ !== 'undefined') {
        widgetDomain = __WIDGET_DOMAIN__;
      } else {
        widgetDomain = isLocal ? window.location.origin : environmentConfig.WIDGET_DOMAIN;
      }
      
      // Determine the correct iframe path for staging builds
      const isStaging = typeof __IS_STAGING__ !== 'undefined' && __IS_STAGING__;
      const iframePath = isStaging && widgetDomain === window.location.origin ?
        '/dist/staging/iframe.html' :
        '/iframe.html';
      
      let iframeUrl = `${widgetDomain}${iframePath}?t=${this.tenantHash}`;
      
      if (isLocal && !iframeUrl.includes('picasso-env')) {
        iframeUrl += '&picasso-env=development';
      } else if (isStaging) {
        iframeUrl += '&picasso-env=staging';
      }
      
      console.log(`🌐 Loading iframe from: ${iframeUrl} (${isLocal ? 'LOCAL' : 'PROD'} mode)`);
      console.log(`💡 To use dev mode, add ?picasso-dev=true to URL or data-dev="true" to script tag`);
      
      // Configure iframe for complete isolation
      Object.assign(this.iframe, {
        src: iframeUrl,
        id: 'picasso-widget-iframe',
        title: 'Picasso Chat Widget',
        allow: 'camera *; microphone *; geolocation *'
        // Removed sandbox attribute to avoid security warning - iframe provides sufficient isolation
      });
      
      // Style iframe for seamless integration
      Object.assign(this.iframe.style, {
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '50%', // Start circular
        overflow: 'hidden',
        transition: 'all 0.3s ease'
      });
      
      this.container.appendChild(this.iframe);
    },
    
    // Setup communication with iframe
    setupEventListeners() {
      // Listen for iframe messages
      window.addEventListener('message', (event) => {
        console.log('📨 Host received message:', event.data.type, 'from:', event.origin);
        
        if (event.source !== this.iframe.contentWindow) {
          console.log('❌ Message not from our iframe, ignoring');
          return;
        }
        
        switch (event.data.type) {
          case 'PICASSO_IFRAME_READY':
            console.log('📡 Iframe ready, sending init data');
            this.sendInitMessage();
            break;
            
          case 'PICASSO_LOADED':
            console.log('✅ Widget loaded successfully');
            break;
            
          case 'PICASSO_EVENT':
            this.handlePicassoEvent(event.data);
            break;
            
          // Legacy support for existing messages
          case 'PICASSO_TOGGLE':
            console.log('🔄 Toggling widget state');
            this.toggle();
            break;
            
          case 'PICASSO_EXPANDED':
            console.log('📈 Chat expanded - iframe should expand');
            this.expand();
            break;
            
          case 'PICASSO_MINIMIZED':
            console.log('📉 Chat minimized - iframe should minimize');
            this.minimize();
            break;
            
          case 'PICASSO_RESIZE':
            console.log('📏 Resizing iframe');
            this.handleResize(event.data.dimensions);
            break;

          case 'PICASSO_SIZE_CHANGE':
            console.log('📐 Size change requested:', event.data);
            if (event.data.isOpen) {
              this.expand();
            } else {
              this.minimize();
            }
            break;

          default:
            console.log('❓ Unknown message type:', event.data.type);
        }
      });
      
      // Handle container clicks for minimize/expand
      this.container.addEventListener('click', (e) => {
        // When closed, clicking anywhere on container or iframe should expand
        if (!this.isOpen) {
          this.expand();
          // Send command to iframe to open chat
          if (this.iframe && this.iframe.contentWindow) {
            this.iframe.contentWindow.postMessage({
              type: 'PICASSO_COMMAND',
              action: 'OPEN_CHAT'
            }, '*');
          }
        }
      });
    },
    
    // Handle PRD-compliant PICASSO_EVENT messages
    handlePicassoEvent(data) {
      const { event, payload } = data;
      
      switch (event) {
        case 'CHAT_OPENED':
          console.log('📈 Chat opened event received');
          this.expand();
          break;
          
        case 'CHAT_CLOSED':
          console.log('📉 Chat closed event received');
          this.minimize();
          break;
          
        case 'MESSAGE_SENT':
          console.log('💬 Message sent event received');
          // Could trigger analytics or other host-side logic
          break;
          
        case 'RESIZE_REQUEST':
          console.log('📏 Resize request received:', payload?.dimensions);
          if (payload?.dimensions) {
            this.handleResize(payload.dimensions);
          }
          break;
          
        default:
          console.log('❓ Unknown PICASSO_EVENT:', event);
      }
    },
    
    // Send PRD-compliant commands to iframe
    sendCommand(action, payload = {}) {
      if (this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type: 'PICASSO_COMMAND',
          action,
          payload
        }, '*');
      }
    },
    
    // Send initialization data to iframe
    sendInitMessage() {
      if (this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type: 'PICASSO_INIT',
          tenantHash: this.tenantHash,
          config: this.config
        }, '*');
      }
    },
    
    // Expand widget to chat interface
    expand() {
      if (this.isOpen) return;
      
      this.isOpen = true;
      
      // Enhanced mobile detection and responsive sizing per PRD
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
      
      if (isMobile) {
        // Near-fullscreen overlay with safe margins per PRD
        Object.assign(this.container.style, {
          position: 'fixed',
          top: '10px',
          left: '10px',
          bottom: '10px', 
          right: '10px',
          width: 'calc(100vw - 20px)',
          height: 'calc(100vh - 20px)',
          zIndex: this.config.zIndex + 1000
        });
      } else if (isTablet) {
        // Tablet: Larger but not fullscreen
        Object.assign(this.container.style, {
          width: '480px',
          height: 'calc(100vh - 40px)',
          bottom: '20px',
          right: '20px'
        });
      } else {
        // Desktop: Standard dimensions from config
        Object.assign(this.container.style, {
          width: this.config.expandedWidth,
          height: this.config.expandedHeight,
          bottom: '20px',
          right: '20px'
        });
      }
      
      Object.assign(this.iframe.style, {
        borderRadius: isMobile ? '12px' : '12px'
      });
      
      console.log(`📈 Widget expanded - ${isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'} mode`);
    },
    
    // Minimize widget to button
    minimize() {
      if (!this.isOpen) return;

      this.isOpen = false;

      Object.assign(this.container.style, {
        position: 'fixed',
        width: this.config.minimizedSize,
        height: this.config.minimizedSize,
        bottom: '20px',
        right: '20px',
        top: 'auto',
        left: 'auto'
      });

      Object.assign(this.iframe.style, {
        borderRadius: '50%'
      });

      console.log('📉 Widget minimized');
    },
    
    // Toggle widget state
    toggle() {
      if (this.isOpen) {
        this.minimize();
      } else {
        this.expand();
      }
    },
    
    // Handle dynamic resizing from iframe
    handleResize(dimensions) {
      if (this.isOpen && dimensions) {
        Object.assign(this.container.style, {
          width: dimensions.width + 'px',
          height: dimensions.height + 'px'
        });
      }
    },
    
    // Setup resize observer for responsive behavior
    setupResizeObserver() {
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
          if (this.isOpen) {
            // Re-apply mobile/desktop sizing
            const isMobile = window.innerWidth <= 768;
            Object.assign(this.container.style, {
              width: isMobile ? 'calc(100vw - 20px)' : this.config.expandedWidth,
              height: isMobile ? 'calc(100vh - 40px)' : this.config.expandedHeight,
              bottom: isMobile ? '10px' : '20px',
              right: isMobile ? '10px' : '20px'
            });
          }
        });
        
        resizeObserver.observe(document.body);
      }
    },
    
    // Public API for external control
    api: {
      open() { PicassoWidget.expand(); },
      close() { PicassoWidget.minimize(); },
      toggle() { PicassoWidget.toggle(); },
      isOpen() { return PicassoWidget.isOpen; }
    }
  };
  
  // Global widget instance and API
  let globalWidgetInstance = null;
  
  // Initialize widget automatically if script has data-tenant
  function autoInit() {
    const script = document.currentScript || 
                  document.querySelector('script[src*="widget"]') ||
                  document.querySelector('script[data-tenant]');
    
    const tenantHash = script?.getAttribute('data-tenant');
    if (tenantHash) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initWidget(tenantHash));
      } else {
        setTimeout(() => initWidget(tenantHash), 0);
      }
    }
  }
  
  // Initialize widget with tenant hash
  function initWidget(tenantHash, config = {}) {
    if (globalWidgetInstance) {
      console.warn('Picasso Widget already initialized');
      return globalWidgetInstance;
    }
    
    globalWidgetInstance = Object.create(PicassoWidget);
    globalWidgetInstance.init(tenantHash, config);
    return globalWidgetInstance;
  }
  
  // Public API - matches PRD specification
  window.PicassoWidget = {
    // Initialization
    init: initWidget,
    
    // Widget state control (PRD-compliant commands)
    open() { 
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand('OPEN_CHAT');
        globalWidgetInstance.expand();
      }
    },
    
    close() { 
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand('CLOSE_CHAT');
        globalWidgetInstance.minimize();
      }
    },
    
    toggle() { 
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand('TOGGLE_CHAT');
        globalWidgetInstance.toggle();
      }
    },
    
    // State queries
    isOpen() { 
      return globalWidgetInstance?.isOpen || false;
    },
    
    isLoaded() {
      return globalWidgetInstance !== null;
    },
    
    // Configuration updates (PRD requirement)
    updateConfig(newConfig) {
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand('UPDATE_CONFIG', newConfig);
      }
    },
    
    // Cleanup
    destroy() {
      if (globalWidgetInstance) {
        globalWidgetInstance.destroy();
        globalWidgetInstance = null;
      }
    },
    
    // Analytics integration
    onEvent(callback) {
      if (typeof callback === 'function') {
        window.addEventListener('message', (event) => {
          if (event.data.type === 'PICASSO_EVENT') {
            callback(event.data);
          }
        });
      }
    }
  };
  
  // Auto-initialize if this script was loaded with data-tenant
  autoInit();
  
})(); // Force rebuild Thu Oct 30 10:20:49 CDT 2025
