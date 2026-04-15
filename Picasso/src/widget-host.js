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
      activeHeight: '100vh', // Full viewport height after first user message (desktop only)
      zIndex: 10000
    },
    isActive: false, // True after first user message — controls expanded height on desktop
    attribution: null, // Captured on init for analytics

    // ========================================================================
    // ATTRIBUTION CAPTURE (for User Journey Analytics)
    // See: /docs/User_Journey/USER_JOURNEY_ANALYTICS_PLAN.md
    // ========================================================================

    /**
     * Capture GA4 client_id from the _ga cookie for session stitching.
     * Enables connecting GA4 site visitors to Picasso sessions.
     * @returns {string|null} GA4 client_id or null if not found
     */
    getGAClientId() {
      try {
        const gaCookie = document.cookie
          .split('; ')
          .find(row => row.startsWith('_ga='));

        if (gaCookie) {
          // _ga=GA1.2.123456789.1702900000 → extract "123456789.1702900000"
          const parts = gaCookie.split('.');
          if (parts.length >= 4) {
            return parts.slice(2).join('.');
          }
        }
      } catch (e) {
        console.warn('[Picasso] Failed to read GA cookie:', e);
      }
      return null;
    },

    /**
     * Get a URL parameter from the current page.
     * @param {string} name - Parameter name
     * @returns {string|null} Parameter value or null
     */
    getUrlParam(name) {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
      } catch (e) {
        return null;
      }
    },

    /**
     * Capture all attribution data from the parent page.
     * Called once during widget initialization.
     * @returns {Object} Attribution data object
     */
    captureAttribution() {
      const attribution = {
        // GA4 session stitching key
        ga_client_id: this.getGAClientId(),

        // UTM parameters (works with any tracking system: Dub.co, Bitly, manual)
        utm_source: this.getUrlParam('utm_source'),
        utm_medium: this.getUrlParam('utm_medium'),
        utm_campaign: this.getUrlParam('utm_campaign'),
        utm_term: this.getUrlParam('utm_term'),
        utm_content: this.getUrlParam('utm_content'),

        // Ad platform click IDs
        gclid: this.getUrlParam('gclid'),   // Google Ads
        fbclid: this.getUrlParam('fbclid'), // Facebook Ads

        // Referrer and landing page
        referrer: document.referrer || null,
        landing_page: window.location.pathname,

        // Timestamp
        captured_at: new Date().toISOString()
      };

      // Log attribution capture for debugging
      const hasAttribution = attribution.ga_client_id ||
                            attribution.utm_source ||
                            attribution.referrer;
      if (hasAttribution) {
        console.log('📊 Attribution captured:', {
          ga_client_id: attribution.ga_client_id ? '✓' : '✗',
          utm_source: attribution.utm_source || '(none)',
          utm_medium: attribution.utm_medium || '(none)',
          referrer: attribution.referrer ? new URL(attribution.referrer).hostname : '(direct)'
        });
      }

      return attribution;
    },

    // Initialize the widget
    init(tenantHash, customConfig = {}) {
      if (!tenantHash) {
        console.error('Picasso Widget: Tenant hash is required');
        return;
      }

      this.tenantHash = tenantHash;
      this.config = { ...this.config, ...customConfig };

      // Capture attribution data from parent page (GA4 client_id, UTM params, referrer)
      this.attribution = this.captureAttribution();

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
      
      // Determine the correct iframe path
      // Always use /iframe.html - staging builds deploy iframe.html to the root of the S3 bucket
      // The /dist/staging/ path only exists during local dev server builds
      const isStaging = typeof __IS_STAGING__ !== 'undefined' && __IS_STAGING__;
      const iframePath = '/iframe.html';
      
      // Store the iframe origin for secure postMessage targeting
      this.iframeOrigin = widgetDomain;

      let iframeUrl = `${widgetDomain}${iframePath}?t=${this.tenantHash}`;
      
      if (isLocal && !iframeUrl.includes('picasso-env')) {
        iframeUrl += '&picasso-env=development';
      } else if (isStaging) {
        iframeUrl += '&picasso-env=staging';
      }

      // Pass nocache param through to iframe for config cache bypass during testing
      if (urlParams.has('nocache')) {
        iframeUrl += '&nocache';
      }
      
      console.log(`🌐 Loading iframe from: ${iframeUrl} (${isLocal ? 'LOCAL' : 'PROD'} mode)`);
      console.log(`💡 To use dev mode, add ?picasso-dev=true to URL or data-dev="true" to script tag`);
      
      // Configure iframe for complete isolation
      Object.assign(this.iframe, {
        src: iframeUrl,
        id: 'picasso-widget-iframe',
        title: 'Picasso Chat Widget',
        allow: 'camera *; microphone *; geolocation *',
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'
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
              // Use dimensions from the message if provided, otherwise fall back to minimize()
              if (event.data.dimensions) {
                this.applyDimensions(event.data.dimensions);
              } else {
                this.minimize();
              }
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
      const { event, payload, analytics } = data;

      // Forward analytics events to backend (embedded mode)
      if (analytics) {
        this.queueAnalyticsEvent(analytics);
      }

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
          this.activateSession();
          break;

        case 'SESSION_CLEARED':
          console.log('🔄 Session cleared — resetting adaptive height');
          this.deactivateSession();
          break;

        case 'RESIZE_REQUEST':
          console.log('📏 Resize request received:', payload?.dimensions);
          if (payload?.dimensions) {
            this.handleResize(payload.dimensions);
          }
          break;

        default:
          // Don't log unknown events if they're analytics-only
          if (!analytics) {
            console.log('❓ Unknown PICASSO_EVENT:', event);
          }
      }
    },

    // Analytics event queue for embedded mode
    analyticsQueue: [],
    analyticsFlushTimeout: null,

    // Queue an analytics event for batched sending
    queueAnalyticsEvent(analyticsEvent) {
      this.analyticsQueue.push(analyticsEvent);

      // Schedule flush if not already scheduled
      if (!this.analyticsFlushTimeout) {
        this.analyticsFlushTimeout = setTimeout(() => {
          this.flushAnalyticsQueue();
        }, 1000); // Batch events over 1 second
      }
    },

    // Flush queued analytics events to backend
    async flushAnalyticsQueue() {
      this.analyticsFlushTimeout = null;

      if (this.analyticsQueue.length === 0) return;

      const events = [...this.analyticsQueue];
      this.analyticsQueue = [];

      // Get streaming endpoint from config or use default
      const streamingEndpoint = this.config?.streamingEndpoint || '';
      const analyticsEndpoint = `${streamingEndpoint}?action=analytics`;

      console.log('📊 [Analytics Host] Flushing', events.length, 'events');

      try {
        const response = await fetch(analyticsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'analytics',
            batch: true,
            events: events
          }),
          keepalive: true
        });

        if (!response.ok) {
          throw new Error(`Analytics endpoint returned ${response.status}`);
        }

        const result = await response.json();
        console.log('📊 [Analytics Host] Flush successful:', result);
      } catch (error) {
        console.warn('[Analytics Host] Failed to flush events:', error);
        // Re-queue failed events
        this.analyticsQueue = [...events, ...this.analyticsQueue];
      }
    },
    
    // Send PRD-compliant commands to iframe
    sendCommand(action, payload = {}) {
      if (this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type: 'PICASSO_COMMAND',
          action,
          payload
        }, this.iframeOrigin);
      }
    },

    // Send initialization data to iframe
    sendInitMessage() {
      if (this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type: 'PICASSO_INIT',
          tenantHash: this.tenantHash,
          config: this.config,
          attribution: this.attribution, // GA4 client_id, UTM params, referrer
          hostViewportWidth: window.innerWidth
        }, this.iframeOrigin);
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
      } else if (this.isActive) {
        // Desktop active: full height, flush right edge, rounded left corners only
        Object.assign(this.container.style, {
          width: this.config.expandedWidth,
          height: 'auto',
          top: '0',
          bottom: '0',
          right: '0',
          left: 'auto'
        });
      } else {
        // Desktop default: standard dimensions from config
        Object.assign(this.container.style, {
          width: this.config.expandedWidth,
          height: this.config.expandedHeight,
          top: 'auto',
          bottom: '20px',
          right: '20px'
        });
      }

      // Border radius and edge mode: left-only when active desktop
      const activeDesktop = !isMobile && !isTablet && this.isActive;
      Object.assign(this.iframe.style, {
        borderRadius: activeDesktop ? '12px 0 0 12px' : '12px'
      });
      if (activeDesktop) {
        this.sendCommand('SET_EDGE_MODE', { enabled: true });
      }

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

    // Activate session — expand to full height on desktop after first user message
    activateSession() {
      if (this.isActive) return;
      this.isActive = true;

      // If already expanded on desktop, smoothly resize to full height
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
      if (this.isOpen && !isMobile && !isTablet) {
        Object.assign(this.container.style, {
          height: 'auto',
          top: '0',
          bottom: '0',
          right: '0',
          left: 'auto'
        });
        this.iframe.style.borderRadius = '12px 0 0 12px';
        this.sendCommand('SET_EDGE_MODE', { enabled: true });
        console.log('📐 Session activated — full height, pinned right');
      }
    },

    // Deactivate session — return to default height on next open
    deactivateSession() {
      this.isActive = false;

      // If currently expanded on desktop, resize back to default
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
      if (this.isOpen && !isMobile && !isTablet) {
        Object.assign(this.container.style, {
          height: this.config.expandedHeight,
          top: 'auto',
          bottom: '20px',
          right: '20px',
          left: 'auto'
        });
        this.iframe.style.borderRadius = '12px';
        this.sendCommand('SET_EDGE_MODE', { enabled: false });
        console.log('📐 Session deactivated — default height restored');
      }
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

    // Apply specific dimensions (used for closed state with dynamic sizing)
    applyDimensions(dimensions) {
      console.log('📐 Applying custom dimensions:', dimensions);

      // Container always stays at bottom-right corner (20px from edges)
      // The iframe content (ChatWidget) handles internal positioning of toggle and callout
      Object.assign(this.container.style, {
        position: 'fixed',
        width: dimensions.width + 'px',
        height: dimensions.height + 'px',
        bottom: '20px',
        right: '20px',
        top: 'auto',
        left: 'auto'
      });

      // Keep circular border radius only if dimensions are square
      const isSquare = Math.abs(dimensions.width - dimensions.height) < 10;
      Object.assign(this.iframe.style, {
        borderRadius: isSquare ? '50%' : '12px'
      });

      console.log(`📏 Applied dimensions: ${dimensions.width}x${dimensions.height}px at bottom-right corner`);
    },
    
    // Setup resize observer for responsive behavior
    setupResizeObserver() {
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
          if (this.isOpen) {
            // Re-apply mobile/desktop sizing
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
              Object.assign(this.container.style, {
                width: 'calc(100vw - 20px)',
                height: 'calc(100vh - 40px)',
                bottom: '10px',
                right: '10px',
                top: 'auto'
              });
            } else if (this.isActive) {
              Object.assign(this.container.style, {
                width: this.config.expandedWidth,
                height: 'auto',
                top: '0',
                bottom: '0',
                right: '0',
                left: 'auto'
              });
            } else {
              Object.assign(this.container.style, {
                width: this.config.expandedWidth,
                height: this.config.expandedHeight,
                bottom: '20px',
                right: '20px',
                top: 'auto'
              });
            }
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
