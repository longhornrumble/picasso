var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
(function() {
  const PicassoWidget = {
    iframe: null,
    container: null,
    isOpen: false,
    tenantHash: null,
    widgetOrigin: null, // Store the expected origin for security
    config: {
      // Default configuration - will be overridden by tenant config
      position: "bottom-right",
      minimizedSize: "56px",
      expandedWidth: "360px",
      expandedHeight: "640px",
      zIndex: 999999
    },
    // Initialize the widget
    init(tenantHash, customConfig = {}) {
      if (!tenantHash) {
        console.error("Picasso Widget: Tenant hash is required");
        return;
      }
      this.tenantHash = tenantHash;
      this.config = __spreadValues(__spreadValues({}, this.config), customConfig);
      console.log("🚀 Initializing Picasso Widget:", tenantHash);
      
      // Ensure viewport meta tag for mobile
      this.ensureViewportMeta();
      
      this.createContainer();
      this.createIframe();
      this.setupEventListeners();
      this.setupResizeObserver();
      
      // Ensure widget starts in correct position
      this.isOpen = true;   // Temporarily set to true so minimize() will run
      this.minimize();      // Apply minimized positioning (this will set isOpen to false)
    },
    // Ensure proper viewport meta tag for mobile
    ensureViewportMeta() {
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        document.head.appendChild(viewport);
        console.log("📱 Added viewport meta tag for mobile support");
      }
    },
    // Create the widget container with positioning
    createContainer() {
      this.container = document.createElement("div");
      this.container.id = "picasso-widget-container";
      Object.assign(this.container.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: this.config.zIndex,
        // Size for minimized state - add more space for notification badge & callout
        width: "90px", // 56px toggle + 34px for badge/callout overflow (badge extends 8px + callout space)
        height: "90px", // 56px toggle + 34px for badge/callout overflow  
        transition: "all 0.3s ease",
        pointerEvents: "auto",
        // Improve touch interactions on mobile
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        cursor: "pointer"
      });
      
      // No additional CSS needed - positioning is handled inline
      
      // Ensure widget is last element in body to avoid z-index issues
      document.body.appendChild(this.container);
      
      // Force widget to top of stacking context
      this.container.style.isolation = "isolate";
      
      // Add critical CSS for mobile viewport issues
      const mobileFixStyle = document.createElement('style');
      mobileFixStyle.innerHTML = `
        #picasso-widget-container {
          position: fixed !important;
          bottom: 20px !important;
          right: 20px !important;
          /* Use CSS env() for safe areas */
          bottom: calc(20px + env(safe-area-inset-bottom, 0px)) !important;
          right: calc(20px + env(safe-area-inset-right, 0px)) !important;
          /* Ensure it stays in visual viewport */
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
        }
        
        /* Fix for iOS Safari viewport issues */
        @supports (-webkit-touch-callout: none) {
          #picasso-widget-container {
            position: -webkit-sticky !important;
            position: fixed !important;
          }
        }
      `;
      document.head.appendChild(mobileFixStyle);
      
      // Debug positioning
      console.log("🎯 Initial container position:", {
        bottom: this.container.style.bottom,
        right: this.container.style.right,
        position: this.container.style.position
      });
    },
    // Create the iframe with your React app
    createIframe() {
      var _a;
      this.iframe = document.createElement("iframe");
      const urlParams = new URLSearchParams(window.location.search);
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const devMode = urlParams.get("picasso-dev") === "true" || 
                     ((_a = document.currentScript) == null ? void 0 : _a.getAttribute("data-dev")) === "true" || 
                     document.querySelector('script[src*="widget.js"][data-dev="true"]') ||
                     isLocalhost; // Auto-detect localhost as dev mode
      
      // Detect if we're in staging based on the script source
      const currentScriptSrc = ((_a = document.currentScript) == null ? void 0 : _a.src) || "";
      // Also check all script tags in case currentScript is null (async loading)
      const allScripts = Array.from(document.querySelectorAll('script[src*="widget.js"]'));
      const stagingScript = allScripts.find(s => s.src.includes('/staging/'));
      const isStaging = currentScriptSrc.includes('/staging/') || !!stagingScript;
      
      if (isStaging) {
        console.log("🎯 Staging mode detected!");
      }
      
      // Dynamically determine the base URL for widget frame
      let widgetDomain;
      let pathPrefix = '';
      
      // Get the script's own URL to determine where assets should load from
      const scriptElement = document.currentScript || document.querySelector('script[src*="widget.js"]');
      const scriptUrl = scriptElement ? new URL(scriptElement.src) : null;
      
      if (devMode && scriptUrl) {
        // In dev mode, use the same origin as the widget.js script
        widgetDomain = scriptUrl.origin;
        console.log(`🔧 Dev mode: Using script origin ${widgetDomain}`);
      } else if (scriptUrl && scriptUrl.pathname.includes('/staging/')) {
        // Staging is detected from the script path
        widgetDomain = scriptUrl.origin;
        pathPrefix = '/staging';
        console.log(`🧪 Staging detected from script path`);
      } else {
        // Production
        widgetDomain = "https://chat.myrecruiter.ai";
      }
      
      // Store the expected origin for security validation
      this.widgetOrigin = widgetDomain;
      
      // Use staging-specific HTML file if in staging mode
      const htmlFile = isStaging ? 'widget-frame-staging.html' : 'widget-frame.html';
      const iframeUrl = `${widgetDomain}${pathPrefix}/${htmlFile}?t=${this.tenantHash}`;
      console.log(`🌐 Loading iframe from: ${iframeUrl} (${devMode ? "DEV" : isStaging ? "STAGING" : "PROD"} mode)`);
      console.log(`💡 To use dev mode, add ?picasso-dev=true to URL or data-dev="true" to script tag`);
      Object.assign(this.iframe, {
        src: iframeUrl,
        id: "picasso-widget-iframe",
        title: "Picasso Chat Widget",
        allow: "camera *; microphone *; geolocation *"
        // Removed sandbox attribute to avoid security warning - iframe provides sufficient isolation
      });
      Object.assign(this.iframe.style, {
        width: "100%",
        height: "100%",
        border: "none",
        borderRadius: "50%",
        // Start circular
        overflow: "hidden",
        transition: "all 0.3s ease"
      });
      this.container.appendChild(this.iframe);
    },
    // Setup communication with iframe
    setupEventListeners() {
      window.addEventListener("message", (event) => {
        console.log("📨 Host received message:", event.data.type, "from:", event.origin);
        
        // Security: Validate origin
        if (!this.isValidOrigin(event.origin)) {
          console.error("❌ Rejected message from untrusted origin:", event.origin);
          return;
        }
        
        if (event.source !== this.iframe.contentWindow) {
          console.log("❌ Message not from our iframe, ignoring");
          return;
        }
        switch (event.data.type) {
          case "PICASSO_IFRAME_READY":
            console.log("📡 Iframe ready, sending init data");
            this.sendInitMessage();
            break;
          case "PICASSO_LOADED":
            console.log("✅ Widget loaded successfully");
            break;
          case "PICASSO_EVENT":
            this.handlePicassoEvent(event.data);
            break;
          // Legacy support for existing messages
          case "PICASSO_TOGGLE":
            console.log("🔄 Toggling widget state");
            this.toggle();
            break;
          case "PICASSO_EXPANDED":
            console.log("📈 Chat expanded - iframe should expand");
            this.expand();
            break;
          case "PICASSO_MINIMIZED":
            console.log("📉 Chat minimized - iframe should minimize");
            this.minimize();
            break;
          case "PICASSO_RESIZE":
            console.log("📏 Resizing iframe");
            this.handleResize(event.data.dimensions);
            break;
          default:
            console.log("❓ Unknown message type:", event.data.type);
        }
      });
      // Handle both click and touch events for mobile
      const handleContainerClick = (e) => {
        if (!this.isOpen && e.target === this.container) {
          e.preventDefault();
          e.stopPropagation();
          this.expand();
        }
      };
      
      this.container.addEventListener("click", handleContainerClick);
      this.container.addEventListener("touchend", handleContainerClick);
    },
    // Handle PRD-compliant PICASSO_EVENT messages
    handlePicassoEvent(data) {
      const { event, payload } = data;
      switch (event) {
        case "CHAT_OPENED":
          console.log("📈 Chat opened event received");
          this.expand();
          break;
        case "CHAT_CLOSED":
          console.log("📉 Chat closed event received");
          this.minimize();
          break;
        case "MESSAGE_SENT":
          console.log("💬 Message sent event received");
          break;
        case "RESIZE_REQUEST":
          console.log("📏 Resize request received:", payload == null ? void 0 : payload.dimensions);
          if (payload == null ? void 0 : payload.dimensions) {
            this.handleResize(payload.dimensions);
          }
          break;
        case "CALLOUT_STATE_CHANGE":
          console.log("📢 Callout state changed:", payload);
          // Resize container for callout regardless of open state
          this.resizeForCallout(payload.calloutConfig);
          break;
        default:
          console.log("❓ Unknown PICASSO_EVENT:", event);
      }
    },
    // Send PRD-compliant commands to iframe
    sendCommand(action, payload = {}) {
      if (this.iframe && this.iframe.contentWindow && this.widgetOrigin) {
        const message = {
          type: "PICASSO_COMMAND",
          action,
          payload,
          timestamp: Date.now() // Add timestamp for debugging
        };
        console.log(`📤 Sending command: ${action}`, payload);
        this.iframe.contentWindow.postMessage(message, this.widgetOrigin);
      } else {
        console.warn(`⚠️ Cannot send command ${action} - iframe not ready`);
      }
    },
    // Send initialization data to iframe
    sendInitMessage() {
      if (this.iframe.contentWindow && this.widgetOrigin) {
        console.log('📡 Sending PICASSO_INIT with tenant:', this.tenantHash);
        this.iframe.contentWindow.postMessage({
          type: "PICASSO_INIT",
          tenantHash: this.tenantHash,
          // Skip config for now - let iframe fetch it directly
          skipConfigWait: true
        }, this.widgetOrigin);
      }
    },
    // Expand widget to chat interface
    expand() {
      if (this.isOpen) return;
      this.isOpen = true;
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth > 768 && window.innerWidth <= 1200;
      
      // Determine iframe size and send to iframe for responsive styling
      let iframeSize = 'desktop';
      
      if (isMobile) {
        iframeSize = 'mobile';
        Object.assign(this.container.style, {
          position: "fixed",
          top: "0",
          left: "0",
          bottom: "0",
          right: "0",
          width: "100vw",
          height: "100vh",
          height: "100dvh", // Dynamic viewport height for mobile browsers
          zIndex: this.config.zIndex + 1e3
        });
      } else if (isTablet) {
        iframeSize = 'tablet';
        // For tablets, scale responsively between mobile and desktop sizes
        // Use 40-60% of screen width, capped at desktop width (360px)
        const responsiveWidth = Math.max(360, Math.min(480, window.innerWidth * 0.5));
        const responsiveHeight = Math.max(480, Math.min(640, window.innerHeight - 120));
        const maxWidth = Math.min(responsiveWidth, window.innerWidth - 40);
        const maxHeight = Math.min(responsiveHeight, window.innerHeight - 80);
        Object.assign(this.container.style, {
          position: "fixed",
          top: "auto",
          left: "auto",
          width: maxWidth + "px",
          height: maxHeight + "px",
          bottom: "20px",
          right: "20px"
        });
      } else {
        iframeSize = 'desktop';
        // Force exact dimensions for desktop mode
        Object.assign(this.container.style, {
          position: "fixed",
          top: "auto",
          left: "auto",
          width: this.config.expandedWidth,
          height: this.config.expandedHeight,
          maxHeight: this.config.expandedHeight, // Ensure no height constraints
          bottom: "20px",
          right: "20px"
        });
      }
      
      Object.assign(this.iframe.style, {
        borderRadius: isMobile ? "0" : "16px"  // Match container radius + padding
      });
      
      // Notify iframe of size change for responsive styling
      this.sendCommand("SIZE_CHANGE", { size: iframeSize, isMobile, isTablet });
      
      console.log(`📈 Widget expanded - ${isMobile ? "mobile" : isTablet ? "tablet" : "desktop"} mode`);
    },
    // Minimize widget to button
    minimize() {
      if (!this.isOpen) return;
      this.isOpen = false;
      
      // Reset all positioning to ensure proper anchoring
      Object.assign(this.container.style, {
        position: "fixed",
        top: "auto",
        left: "auto",
        bottom: "20px",
        right: "20px",
        width: "90px",
        height: "90px",
        zIndex: this.config.zIndex,
        // Ensure smooth transition back to corner
        transition: "all 0.3s ease"
      });
      
      // Reset iframe to circular button
      Object.assign(this.iframe.style, {
        borderRadius: "50%",
        transition: "all 0.3s ease"
      });
      
      // Send minimize command to iframe
      this.sendCommand("MINIMIZE");
      
      // Then apply any callout resizing if needed
      setTimeout(() => {
        this.resizeForCallout();
      }, 50); // Small delay to ensure position is set first
      
      console.log("📉 Widget minimized");
    },
    
    // Security helper: Validate message origin
    isValidOrigin(origin) {
      // In development, allow localhost origins
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      if (isLocalhost && this.widgetOrigin && this.widgetOrigin.includes('localhost')) {
        return true;
      }
      
      // In production, only allow exact match with expected origin
      return origin === this.widgetOrigin;
    },
    
    // Resize container for callout (can be called when widget is open or closed)
    resizeForCallout(calloutConfig = null) {
      // Calculate container size based on callout presence
      let containerWidth = 90;  // Default: 56px toggle + 34px for badge
      let containerHeight = 90;
      
      if (calloutConfig && calloutConfig.visible) {
        // Callout is visible - expand container to accommodate it
        // Callout: 300px width + 70px toggle area + 20px spacing = 390px total
        containerWidth = Math.max(390, calloutConfig.width + 90);
        containerHeight = Math.max(90, calloutConfig.height + 20); // Add some vertical padding
        console.log(`📢 Callout active - expanding container to ${containerWidth}x${containerHeight}`);
      }
      
      // Only apply minimized styling when widget is actually closed
      if (!this.isOpen) {
        Object.assign(this.container.style, {
          width: containerWidth + "px",
          height: containerHeight + "px",
          bottom: "20px",
          right: "20px",
          position: "fixed",
          top: "auto",
          left: "auto"
        });
        Object.assign(this.iframe.style, {
          borderRadius: calloutConfig && calloutConfig.visible ? "12px" : "50%"
        });
        console.log(`📦 Container resized for callout: ${containerWidth}x${containerHeight}`);
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
          width: dimensions.width + "px",
          height: dimensions.height + "px"
        });
      }
    },
    // Setup resize observer for responsive behavior
    setupResizeObserver() {
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
          if (this.isOpen) {
            const isMobile = window.innerWidth <= 768;
            const isTablet = window.innerWidth > 768 && window.innerWidth <= 1200;
            
            if (isMobile) {
              Object.assign(this.container.style, {
                position: "fixed",
                top: "0",
                left: "0",
                bottom: "0",
                right: "0",
                width: "100vw",
                height: "100vh",
                height: "100dvh" // Dynamic viewport height for mobile browsers
              });
            } else if (isTablet) {
              // For tablets, scale responsively between mobile and desktop sizes
              // Use 40-60% of screen width, capped at desktop width (360px)
              const responsiveWidth = Math.max(360, Math.min(480, window.innerWidth * 0.5));
              const responsiveHeight = Math.max(480, Math.min(640, window.innerHeight - 120));
              const maxWidth = Math.min(responsiveWidth, window.innerWidth - 40);
              const maxHeight = Math.min(responsiveHeight, window.innerHeight - 80);
              Object.assign(this.container.style, {
                position: "fixed",
                top: "auto",
                left: "auto",
                width: maxWidth + "px",
                height: maxHeight + "px",
                bottom: "20px",
                right: "20px"
              });
            } else {
              Object.assign(this.container.style, {
                position: "fixed",
                top: "auto",
                left: "auto",
                width: this.config.expandedWidth,
                height: this.config.expandedHeight,
                bottom: "20px",
                right: "20px"
              });
            }
          }
        });
        resizeObserver.observe(document.body);
      }
    },
    // Public API for external control
    api: {
      open() {
        PicassoWidget.expand();
      },
      close() {
        PicassoWidget.minimize();
      },
      toggle() {
        PicassoWidget.toggle();
      },
      isOpen() {
        return PicassoWidget.isOpen;
      }
    }
  };
  let globalWidgetInstance = null;
  function autoInit() {
    const script = document.currentScript || document.querySelector('script[src*="widget"]') || document.querySelector("script[data-tenant]");
    const tenantHash = script == null ? void 0 : script.getAttribute("data-tenant");
    if (tenantHash) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => initWidget(tenantHash));
      } else {
        setTimeout(() => initWidget(tenantHash), 0);
      }
    }
  }
  function initWidget(tenantHash, config = {}) {
    if (globalWidgetInstance) {
      console.warn("Picasso Widget already initialized");
      return globalWidgetInstance;
    }
    globalWidgetInstance = Object.create(PicassoWidget);
    globalWidgetInstance.init(tenantHash, config);
    return globalWidgetInstance;
  }
  window.PicassoWidget = {
    // Initialization
    init: initWidget,
    // Widget state control (PRD-compliant commands)
    open() {
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand("OPEN_CHAT");
        globalWidgetInstance.expand();
      }
    },
    close() {
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand("CLOSE_CHAT");
        globalWidgetInstance.minimize();
      }
    },
    toggle() {
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand("TOGGLE_CHAT");
        globalWidgetInstance.toggle();
      }
    },
    // State queries
    isOpen() {
      return (globalWidgetInstance == null ? void 0 : globalWidgetInstance.isOpen) || false;
    },
    isLoaded() {
      return globalWidgetInstance !== null;
    },
    // Configuration updates (PRD requirement)
    updateConfig(newConfig) {
      if (globalWidgetInstance) {
        globalWidgetInstance.sendCommand("UPDATE_CONFIG", newConfig);
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
      if (typeof callback === "function") {
        window.addEventListener("message", (event) => {
          // Security: Validate origin before processing analytics events
          if (globalWidgetInstance && globalWidgetInstance.isValidOrigin(event.origin) && 
              event.data.type === "PICASSO_EVENT") {
            callback(event.data);
          }
        });
      }
    },
    // Health check mechanism
    health() {
      const status = {
        widgetLoaded: globalWidgetInstance !== null,
        iframeLoaded: globalWidgetInstance && globalWidgetInstance.iframe !== null,
        containerExists: globalWidgetInstance && globalWidgetInstance.container !== null,
        isOpen: (globalWidgetInstance == null ? void 0 : globalWidgetInstance.isOpen) || false,
        tenantHash: (globalWidgetInstance == null ? void 0 : globalWidgetInstance.tenantHash) || null,
        timestamp: new Date().toISOString()
      };
      
      // Check if iframe is responsive
      if (globalWidgetInstance && globalWidgetInstance.iframe && globalWidgetInstance.iframe.contentWindow) {
        try {
          // Send health check message to iframe
          globalWidgetInstance.iframe.contentWindow.postMessage({
            type: "PICASSO_HEALTH_CHECK"
          }, globalWidgetInstance.widgetOrigin || '*');
          status.iframeResponsive = true;
        } catch (error) {
          status.iframeResponsive = false;
          status.error = error.message;
        }
      } else {
        status.iframeResponsive = false;
      }
      
      // Overall health status
      status.healthy = status.widgetLoaded && status.iframeLoaded && status.containerExists && status.iframeResponsive;
      
      return status;
    }
  };
  autoInit();
})();

