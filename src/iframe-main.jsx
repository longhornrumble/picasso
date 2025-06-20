import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from './context/ConfigProvider.jsx';
import { ChatProvider } from './context/ChatProvider.jsx';
import ChatWidget from './components/chat/ChatWidget.jsx';
import { CSSVariablesProvider } from './components/chat/useCSSVariables.js';
import "./styles/theme.css";

/**
 * iframe-main.jsx
 * 
 * Standalone entry point for iframe rendering
 * Designed to avoid Vite's React plugin preamble detection issues
 * Performance optimized per PRD requirements
 */

// Performance monitoring
const performanceMetrics = {
  iframeStartTime: performance.now(),
  configStartTime: null,
  configEndTime: null,
  iframeReadyTime: null
};

// Notify parent that iframe is ready
function notifyParentReady() {
  performanceMetrics.iframeReadyTime = performance.now();
  const loadTime = performanceMetrics.iframeReadyTime - performanceMetrics.iframeStartTime;
  
  console.log(`⚡ Iframe loaded in ${loadTime.toFixed(2)}ms ${loadTime < 500 ? '✅' : '⚠️ (PRD target: <500ms)'}`);
  
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'PICASSO_IFRAME_READY',
      performance: {
        loadTime,
        configLoadTime: performanceMetrics.configEndTime ? 
          performanceMetrics.configEndTime - performanceMetrics.configStartTime : null
      }
    }, '*');
  }
}

// Notify parent of state changes (PRD-compliant events)
function notifyParentEvent(event, payload = {}) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'PICASSO_EVENT',
      event,
      payload
    }, '*');
  }
}

// Listen for commands from host (PRD-compliant)
function setupCommandListener() {
  window.addEventListener('message', (event) => {
    if (event.data.type === 'PICASSO_COMMAND') {
      const { action, payload } = event.data;
      
      switch (action) {
        case 'OPEN_CHAT':
          console.log('📡 Received OPEN_CHAT command');
          document.body.classList.add('chat-open');
          notifyParentEvent('CHAT_OPENED');
          break;
          
        case 'CLOSE_CHAT':
          console.log('📡 Received CLOSE_CHAT command');
          document.body.classList.remove('chat-open');
          notifyParentEvent('CHAT_CLOSED');
          break;
          
        case 'UPDATE_CONFIG':
          console.log('📡 Received UPDATE_CONFIG command:', payload);
          // Could trigger config reload if needed
          break;
          
        default:
          console.log('❓ Unknown command:', action);
      }
    }
  });
}

// Initialize the React widget
function initializeWidget() {
  const container = document.getElementById("root");
  
  if (!container) {
    console.error("Picasso Widget: Root container not found");
    return;
  }

  try {
    console.log('🚀 DOM ready, setting up iframe context...');
    
    // Set iframe context attributes for CSS targeting
    document.body.setAttribute('data-iframe', 'true');
    document.documentElement.setAttribute('data-iframe-context', 'true');
    console.log('✅ Set data-iframe-context on HTML element for maximum CSS specificity');
    
    // Get tenant hash from URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    const tenantHash = urlParams.get('t') || 'fo85e6a06dcdf4';
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
              console.log(`⚡ Config loaded from cache in ${loadTime.toFixed(2)}ms ✅`);
              return cachedConfig;
            }
          } catch (e) {
            console.warn('Invalid cached config, fetching fresh');
          }
        }
        
        const configUrl = `https://chat.myrecruiter.ai/Master_Function?action=get_config&t=${encodeURIComponent(tenantHash)}`;
        console.log('🔄 Fetching config from:', configUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
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
    
    // Create React root and render app
    const root = createRoot(container);
    root.render(
      <ConfigProvider>
        <ChatProvider>
          <CSSVariablesProvider>
            <ChatWidget />
          </CSSVariablesProvider>
        </ChatProvider>
      </ConfigProvider>
    );
    
    console.log("✅ Picasso Widget iframe initialized successfully");
    
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