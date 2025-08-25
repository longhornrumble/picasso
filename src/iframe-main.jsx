// Load string safety polyfill first
import './utils/stringPolyfill.js';

import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from './context/ConfigProvider.js';
import ChatProviderOrchestrator from './context/ChatProviderOrchestrator.jsx';
import ChatWidget from './components/chat/ChatWidget.jsx';
import { CSSVariablesProvider } from './components/chat/useCSSVariables.js';
import { config as environmentConfig } from './config/environment.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { setupGlobalErrorHandling, performanceMonitor } from './utils/errorHandling.js';
import { performanceTracker } from './utils/performanceTracking.js';
import "./styles/theme.css";
import "./styles/widget-entry.css";

/**
 * iframe-main.jsx
 * 
 * Standalone entry point for iframe rendering
 * Designed to avoid Vite's React plugin preamble detection issues
 * Performance optimized per PRD requirements
 */

// Performance monitoring with enhanced tracking
const performanceMetrics = {
  iframeStartTime: performance.now(),
  configStartTime: null,
  configEndTime: null,
  iframeReadyTime: null,
  firstMessageTime: null,
  renderStartTime: null,
  renderEndTime: null
};

// Expose performance metrics globally for other components
window.performanceMetrics = performanceMetrics;

// Expose performance tracker for debugging and health checks
window.PicassoPerformance = performanceTracker;

// Setup global error handling immediately
setupGlobalErrorHandling();

// Security: Get allowed parent origins
function getAllowedOrigins() {
  const origins = [];
  
  // Always allow the parent origin if we're in an iframe
  if (window.parent !== window && document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      origins.push(referrerUrl.origin);
    } catch (e) {
      console.warn('Could not parse referrer URL:', e);
    }
  }
  
  // In development, allow localhost origins - use import.meta.env for build-time evaluation
  if (import.meta.env.DEV) {
    origins.push('http://localhost:5173');
    origins.push('http://localhost:3000');
    origins.push('http://localhost:8000'); // Add esbuild dev server port
    origins.push('http://127.0.0.1:5173');
    origins.push('http://127.0.0.1:3000');
    origins.push('http://127.0.0.1:8000'); // Add esbuild dev server port
  }
  
  // In production, only allow specific domains
  origins.push('https://myrecruiter.ai');
  origins.push('https://www.myrecruiter.ai');
  origins.push('https://app.myrecruiter.ai');
  
  return origins;
}

// Security: Validate message origin
function isValidOrigin(origin) {
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(origin);
}

// Notify parent that iframe is ready
function notifyParentReady() {
  performanceMetrics.iframeReadyTime = performance.now();
  const loadTime = performanceMetrics.iframeReadyTime - performanceMetrics.iframeStartTime;
  
  // Track widget load performance
  performanceTracker.track('widgetLoad', loadTime, {
    tenantHash: window.PicassoConfig?.tenant || 'unknown',
    iframeMode: true
  });
  
  console.log(`⚡ Iframe loaded in ${loadTime.toFixed(2)}ms ${loadTime < 500 ? '✅' : '⚠️ (PRD target: <500ms)'}`);
  
  if (window.parent && window.parent !== window) {
    // Get parent origin from referrer or use wildcard for initial handshake only
    const targetOrigin = document.referrer ? new URL(document.referrer).origin : '*';
    window.parent.postMessage({
      type: 'PICASSO_IFRAME_READY',
      performance: {
        loadTime,
        configLoadTime: performanceMetrics.configEndTime ? 
          performanceMetrics.configEndTime - performanceMetrics.configStartTime : null
      }
    }, targetOrigin);
  }
}

// Notify parent of state changes (PRD-compliant events)
function notifyParentEvent(event, payload = {}) {
  if (window.parent && window.parent !== window) {
    // Get parent origin from referrer for security
    const targetOrigin = document.referrer ? new URL(document.referrer).origin : '*';
    window.parent.postMessage({
      type: 'PICASSO_EVENT',
      event,
      payload
    }, targetOrigin);
  }
}

// Listen for commands from host (PRD-compliant)
function setupCommandListener() {
  window.addEventListener('message', (event) => {
    // Security: Validate origin before processing any messages
    if (!isValidOrigin(event.origin)) {
      console.error('❌ Rejected message from untrusted origin:', event.origin);
      return;
    }
    
    if (event.data.type === 'PICASSO_COMMAND') {
      const { action, payload } = event.data;
      
      switch (action) {
        case 'OPEN_CHAT':
          console.log('📡 Received OPEN_CHAT command');
          document.body.classList.add('chat-open');
          // Dispatch custom event to notify React component
          window.dispatchEvent(new CustomEvent('picasso-open-chat'));
          notifyParentEvent('CHAT_OPENED');
          break;
          
        case 'CLOSE_CHAT':
          console.log('📡 Received CLOSE_CHAT command');
          document.body.classList.remove('chat-open');
          // Dispatch custom event to notify React component
          window.dispatchEvent(new CustomEvent('picasso-close-chat'));
          notifyParentEvent('CHAT_CLOSED');
          break;
          
        case 'UPDATE_CONFIG':
          console.log('📡 Received UPDATE_CONFIG command:', payload);
          // Could trigger config reload if needed
          break;
          
        case 'SIZE_CHANGE':
          console.log('📡 Received SIZE_CHANGE command:', payload);
          // Apply size class to body for responsive styling
          if (payload?.size) {
            document.body.classList.remove('iframe-mobile', 'iframe-tablet', 'iframe-desktop');
            document.body.classList.add(`iframe-${payload.size}`);
            
            // Also set data attributes for CSS targeting
            document.body.setAttribute('data-iframe-size', payload.size);
            if (payload.isMobile) document.body.setAttribute('data-mobile', 'true');
            if (payload.isTablet) document.body.setAttribute('data-tablet', 'true');
          }
          break;
          
        case 'MINIMIZE':
          console.log('📡 Received MINIMIZE command');
          document.body.classList.remove('chat-open');
          notifyParentEvent('CHAT_CLOSED');
          break;
          
        default:
          console.log('❓ Unknown command:', action);
      }
    }
    
    // Handle PICASSO_INIT from parent
    if (event.data.type === 'PICASSO_INIT') {
      // Security: Validate origin for INIT messages too
      if (!isValidOrigin(event.origin)) {
        console.error('❌ Rejected PICASSO_INIT from untrusted origin:', event.origin);
        return;
      }
      
      console.log('📡 Received PICASSO_INIT from parent:', event.data);
      if (event.data.tenantHash) {
        console.log('✅ Parent confirmed tenant hash:', event.data.tenantHash);
        // Config will be fetched by normal flow - handshake complete
      }
    }
    
    // Handle health check requests
    if (event.data.type === 'PICASSO_HEALTH_CHECK') {
      // Security: Validate origin for health check messages
      if (!isValidOrigin(event.origin)) {
        console.error('❌ Rejected PICASSO_HEALTH_CHECK from untrusted origin:', event.origin);
        return;
      }
      
      const healthStatus = {
        type: 'PICASSO_HEALTH_RESPONSE',
        status: {
          iframeAlive: true,
          configLoaded: !!window.PicassoConfig,
          tenantHash: window.PicassoConfig?.tenant || window.PicassoConfig?.tenant_id,
          performanceMetrics: {
            iframeLoadTime: performanceMetrics.iframeReadyTime ? 
              performanceMetrics.iframeReadyTime - performanceMetrics.iframeStartTime : null,
            configLoadTime: performanceMetrics.configEndTime ? 
              performanceMetrics.configEndTime - performanceMetrics.configStartTime : null,
            totalLoadTime: performanceMetrics.renderEndTime ? 
              performanceMetrics.renderEndTime - performanceMetrics.iframeStartTime : null
          },
          timestamp: new Date().toISOString()
        }
      };
      
      // Send health response back to parent
      const targetOrigin = document.referrer ? new URL(document.referrer).origin : '*';
      window.parent.postMessage(healthStatus, targetOrigin);
    }
  });
}

// Initialize the React widget with performance tracking
function initializeWidget() {
  performanceMonitor.startTimer('widget_initialization');
  const container = document.getElementById("root");
  
  if (!container) {
    console.error("Picasso Widget: Root container not found");
    performanceMonitor.endTimer('widget_initialization');
    return;
  }

  try {
    console.log('🚀 DOM ready, setting up iframe context...');
    performanceMetrics.renderStartTime = performance.now();
    
    // Set iframe context attributes for CSS targeting
    document.body.setAttribute('data-iframe', 'true');
    document.documentElement.setAttribute('data-iframe-context', 'true');
    console.log('✅ Set data-iframe-context on HTML element for maximum CSS specificity');
    
    // Get tenant hash from URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    const tenantHash = urlParams.get('t') || environmentConfig.getDefaultTenantHash();
    console.log('🔑 Using tenant hash:', tenantHash);
    
    // Set up config for iframe mode to use live API
    if (!window.PicassoConfig) {
      window.PicassoConfig = {
        mode: 'widget',
        tenant: tenantHash,
        tenant_id: tenantHash,
        iframe_mode: false  // Allow normal API loading
      };
      console.log('✅ Set iframe config to use live API with tenant hash:', tenantHash);
    }
    
    // Create a proper fetchTenantConfig function for the iframe context
    window.fetchTenantConfig = async () => {
      performanceMetrics.configStartTime = performance.now();
      
      try {
        // Check for cached config first (performance optimization)
        const cacheKey = `picasso_config_${tenantHash}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          try {
            const cachedConfig = JSON.parse(cached);
            const cacheAge = Date.now() - (cachedConfig._cached || 0);
            if (cacheAge < 300000) { // 5 minutes cache
              performanceMetrics.configEndTime = performance.now();
              const loadTime = performanceMetrics.configEndTime - performanceMetrics.configStartTime;
              
              // Track cached config performance
              performanceTracker.track('configFetch', loadTime, {
                tenantHash,
                fromCache: true,
                cacheAge
              });
              
              console.log(`⚡ Config loaded from cache in ${loadTime.toFixed(2)}ms ✅`);
              return cachedConfig;
            }
          } catch {
            console.warn('Invalid cached config, fetching fresh');
          }
        }
        
        const configUrl = environmentConfig.getConfigUrl(tenantHash);
        console.log('🔄 Fetching config from:', configUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // PERFORMANCE: 3 second timeout for faster failure detection
        
        const response = await fetch(configUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-cache',
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const config = await response.json();
        
        // Cache the config with timestamp
        config._cached = Date.now();
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(config));
        } catch (e) {
          console.warn('Failed to cache config:', e);
        }
        
        performanceMetrics.configEndTime = performance.now();
        const loadTime = performanceMetrics.configEndTime - performanceMetrics.configStartTime;
        
        // Track config fetch performance
        performanceTracker.track('configFetch', loadTime, {
          tenantHash,
          fromCache: false
        });
        
        console.log(`⚡ Config fetched in ${loadTime.toFixed(2)}ms ${loadTime < 200 ? '✅' : '⚠️ (PRD target: <200ms)'}`);
        
        return config;
      } catch (error) {
        performanceMetrics.configEndTime = performance.now();
        const loadTime = performanceMetrics.configEndTime - performanceMetrics.configStartTime;
        console.error(`❌ Failed to fetch config in ${loadTime.toFixed(2)}ms:`, error);
        
        // Return a basic fallback config
        return {
          tenant_id: tenantHash,
          tenant_hash: tenantHash,
          chat_title: 'Chat Assistant',
          welcome_message: 'Hello! How can I help you today?',
          branding: {
            primary_color: '#3b82f6',
            background_color: '#ffffff',
            font_color: '#374151',
            chat_title: 'Chat Assistant'
          },
          features: {
            quick_help: { enabled: true },
            action_chips: { enabled: true },
            callout: { enabled: true }
          },
          widget_behavior: {
            auto_open: false,
            auto_open_delay: 3
          }
        };
      }
    };
    
    // Create script tag for compatibility (some components might check for it)
    const existingScript = document.querySelector('script[src*="widget.js"]');
    if (!existingScript) {
      const mockScript = document.createElement('script');
      mockScript.setAttribute('data-tenant', tenantHash);
      // Don't set src to avoid import errors - just create the element for compatibility
      document.head.appendChild(mockScript);
      console.log('✅ Added compatibility script tag with tenant hash:', tenantHash);
    }
    
    // Ensure full height usage in iframe
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    
    // Add a temporary loading indicator
    container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f0f0f0; color: #333; font-family: system-ui; flex-direction: column; gap: 10px;"><div>🎨 Loading Picasso...</div><div style="font-size: 12px; opacity: 0.7;">Iframe mode detected</div></div>';
    
    // Verify attributes were set
    const isIframe = document.body.getAttribute('data-iframe');
    console.log('✅ data-iframe attribute set to:', isIframe);
    console.log('✅ Iframe height setup complete');
    
    // Create React root and render app with ErrorBoundary
    const root = createRoot(container);
    root.render(
      <ErrorBoundary>
        <ConfigProvider>
          <CSSVariablesProvider>
            <ChatProviderOrchestrator>
              <ChatWidget />
            </ChatProviderOrchestrator>
          </CSSVariablesProvider>
        </ConfigProvider>
      </ErrorBoundary>
    );
    
    console.log("✅ Picasso Widget iframe initialized successfully");
    
    // Track render completion
    performanceMetrics.renderEndTime = performance.now();
    performanceMonitor.endTimer('widget_initialization');
    
    // Log performance metrics
    const metrics = {
      totalLoadTime: performanceMetrics.renderEndTime - performanceMetrics.iframeStartTime,
      renderTime: performanceMetrics.renderEndTime - performanceMetrics.renderStartTime,
      configLoadTime: performanceMetrics.configEndTime ? 
        performanceMetrics.configEndTime - performanceMetrics.configStartTime : null
    };
    
    if (metrics.totalLoadTime > 500) {
      performanceMonitor.measure('slow_iframe_load', () => {
        console.warn(`⚠️ Slow iframe load detected: ${metrics.totalLoadTime.toFixed(2)}ms (target: <500ms)`);
      });
    }
    
    console.log('📊 Performance metrics:', metrics);
    
    // Notify parent that we're ready
    notifyParentReady();
    
    // Listen for commands from host (PRD-compliant)
    setupCommandListener();
    
  } catch (error) {
    console.error("❌ Error initializing Picasso Widget:", error);
    // Show error in iframe
    container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #ffe6e6; color: #d63031; font-family: system-ui; text-align: center; padding: 20px;">
      <div>
        <h3>Picasso Widget Error</h3>
        <p>${error.message}</p>
        <small>Check console for details</small>
      </div>
    </div>`;
  }
}

// Robust initialization that handles various states
function startIframe() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidget);
  } else if (document.readyState === 'interactive' || document.readyState === 'complete') {
    // Small delay to ensure all resources are loaded
    setTimeout(initializeWidget, 10);
  }
}

// Start the iframe application
startIframe(); 