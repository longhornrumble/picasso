// Load string safety polyfill first
import './utils/stringPolyfill.js';

import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from './context/ConfigProvider.jsx';
import { FormModeProvider } from './context/FormModeContext.jsx';
import ChatProviderOrchestrator from './context/ChatProviderOrchestrator.jsx';
import ChatWidget from './components/chat/ChatWidget.jsx';
import SchedulingPage from './components/scheduling/SchedulingPage.jsx';
import { CSSVariablesProvider } from './components/chat/useCSSVariables.js';
import { HairlineThemeProvider } from './theme/HairlineThemeProvider.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { config as environmentConfig } from './config/environment.js';
import { _storeGet, _storeSet, getFromSession, saveToSession } from './context/shared/messageHelpers.js';
import { setHostViewportWidth } from './utils/resolveWidgetBehavior.js';
import { resolveParentTargetOrigin, getAllowedParentOrigins } from './utils/parentOrigin.js';
import { setupGlobalErrorHandling, performanceMonitor } from './utils/errorHandling.js';
import { performanceTracker } from './utils/performanceTracking.js';
import { SCHEMA_VERSION, ALL_EVENT_TYPES } from './analytics/eventConstants.js';
import "./styles/widget-entry.css";
import "./styles/theme.css";
import "./styles/fonts.css";
import "./styles/schedule-page.css";
// Hairline redesign (W1.2): fixed token sheet — definitions only.
import "./styles/hairline-tokens.css";
// Hairline redesign (W2.1): shell + header — the first surface to actually
// consume the token sheet above (ChatWidget.jsx's shell container +
// ChatHeader.jsx). Imported after it for cascade correctness.
import "./styles/hairline-shell.css";
// Hairline redesign (W2.4): composer idle/expanded restyle. InputBar.jsx
// renders the new `.hairline-composer` markup exclusively (old
// `.input-bar-container` classes are gone from that component), so this
// sheet is live the moment it's imported — old theme.css rules for the
// retired class names simply have no matching elements left to style.
import "./styles/hairline-composer.css";
// Hairline redesign (W2.2): thread (asymmetric messages) + typing indicator.
// MessageBubble.jsx/TypingIndicator.jsx render the new `.hairline-message*`
// markup exclusively — old `.message`/`.message.user`/`.message.bot`/
// `.message-content` classes are gone from those components.
import "./styles/hairline-thread.css";
// Hairline redesign (W3.3+): full-takeover / overlay views (Settings now;
// Welcome/Common-questions/Privacy append to the same sheet — see its
// header comment).
import "./styles/hairline-views.css";
// Hairline redesign (W4.1): conversational forms suite — unmocked surface,
// fresh Hairline treatment (no Turn 10 mock). FormFieldPrompt.jsx,
// CompositeFieldGroup.jsx, and FormCompletionCard.jsx render exclusively
// under new `.hairline-form*`/`.hairline-composite*`/`.hairline-completion*`
// markup — old `.form-field-prompt`/`.composite-field-*`/
// `.form-completion-*` classes are gone from those components.
import "./styles/hairline-forms.css";
// Hairline redesign (W4.3): showcase card — unmocked surface (D2: keep +
// restyle, not retire), fresh Hairline treatment reusing the hairline-card
// anatomy established by hairline-forms.css. ShowcaseCard.jsx renders
// exclusively under new `.hairline-showcase*` markup — old `.showcase-card*`
// classes in theme.css are gone from that component.
import "./styles/hairline-showcase.css";
// Hairline redesign (W4.4): in-thread sent-attachment previews, the
// failed-message retry button, and this file's own pre-React iframe
// loading/error placeholder below — unmocked surfaces, fresh Hairline
// treatment. FIlePreview.jsx's in-thread branches and this file's
// innerHTML placeholders render exclusively under new
// `.hairline-attachment-preview*`/`.hairline-iframe-*` markup — old
// `.image-preview`/`.video-preview`/`.pdf-preview`/`.picasso-iframe-*`
// classes in theme.css are gone from their call sites.
import "./styles/hairline-attachments.css";

// ============================================================================
// ANALYTICS STATE (for User Journey Analytics)
// See: /docs/User_Journey/USER_JOURNEY_ANALYTICS_PLAN.md
// ============================================================================

/**
 * Analytics state for event tracking.
 * - stepCounter: Increments with each event for ordering
 * - attribution: Captured from parent page (GA4 client_id, UTM params, etc.)
 * - sessionId: Generated on widget init for session grouping
 */
const analyticsState = {
  stepCounter: 0,
  attribution: null,
  sessionId: null,
  tenantHash: null
};

/**
 * Generate a unique session ID for analytics.
 * Format: sess_<timestamp>_<random>
 */
function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sess_${timestamp}_${random}`;
}

// Initialize session ID + step counter immediately.
// On reload of an existing conversation the chat path restores picasso_session_id
// from sessionStorage; restore the SAME id AND the step counter here so post-reload
// analytics events keep one session_id and continue at the next step_number. Restoring
// only the id (and letting stepCounter reset to 0) re-uses low step numbers under the
// unified session → the conversation log (keyed SESSION#id + STEP#n) mis-orders the
// post-reload turn and can overwrite pre-reload events at the same STEP#.
const resumedSessionId = getFromSession('picasso_session_id');
if (resumedSessionId) {
  analyticsState.sessionId = resumedSessionId;
  analyticsState.stepCounter = Number(getFromSession('picasso_step_counter')) || 0;
} else {
  analyticsState.sessionId = generateSessionId();
}
console.log('📊 Analytics session initialized:', analyticsState.sessionId, '@ step', analyticsState.stepCounter);

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

// Security: Get allowed parent origins (SR-2: logic lives in the unit-tested
// utils/parentOrigin.js; embed-anywhere referrer echo is retained there).
function getAllowedOrigins() {
  return getAllowedParentOrigins({
    isDev: import.meta.env.DEV,
    referrer: window.parent !== window ? document.referrer : '',
  });
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
    // SR-1: resolve a concrete parent origin (never '*'); fail closed if none.
    const targetOrigin = resolveParentTargetOrigin({
      mode: new URLSearchParams(window.location.search).get('mode'),
      referrer: document.referrer,
      locationOrigin: window.location.origin,
    });
    if (targetOrigin) {
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
}

/**
 * Notify parent of state changes (PRD-compliant events with analytics envelope)
 *
 * Uses the envelope pattern for schema versioning:
 * {
 *   schema_version: "1.0.0",
 *   session_id: "sess_...",
 *   tenant_id: "...",
 *   timestamp: "...",
 *   step_number: N,
 *   event: { type: "...", payload: {...} },
 *   ga_client_id: "..." (if available)
 * }
 *
 * Works in both embedded (iframe) and full-page modes:
 * - Embedded: Sends via postMessage to parent window
 * - Full-page: Queues events locally and sends directly to backend
 *
 * @param {string} eventType - Event type from eventConstants.js
 * @param {Object} payload - Event-specific payload data
 */
function notifyParentEvent(eventType, payload = {}) {
  // Always increment step counter for event ordering
  analyticsState.stepCounter++;
  // Persist so a reload resumes the counter (see session-init block) instead of
  // restarting step_number at 1 and colliding with pre-reload events.
  saveToSession('picasso_step_counter', analyticsState.stepCounter);

  // Build analytics envelope (schema versioning pattern)
  const analyticsEvent = {
    // Envelope fields
    schema_version: SCHEMA_VERSION,
    session_id: analyticsState.sessionId,
    tenant_id: analyticsState.tenantHash,
    timestamp: new Date().toISOString(),
    step_number: analyticsState.stepCounter,

    // Event data
    event: {
      type: eventType,
      payload: payload
    }
  };

  // Add GA4 client_id if available (for attribution stitching)
  if (analyticsState.attribution?.ga_client_id) {
    analyticsEvent.ga_client_id = analyticsState.attribution.ga_client_id;
  }

  // Validate event type (warn in development only)
  if (import.meta.env.DEV && !ALL_EVENT_TYPES.includes(eventType)) {
    console.warn(`[Analytics] Unknown event type: ${eventType}. Expected one of:`, ALL_EVENT_TYPES);
  }

  // Check if running in iframe (embedded mode) or full-page mode.
  // NOTE: in full-page mode the React app still loads inside iframe.html, which is
  // itself loaded as a child iframe of index.html. So `window.parent !== window` is
  // TRUE even in full-page mode — but index.html has no widget-host.js listener,
  // so postMessage events would be silently dropped. Detect ?mode=fullpage from the
  // URL and force the local queue + flush path so analytics events reach the backend.
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');
  // Both fullpage and schedule are STANDALONE hosts (their shell index.html has no
  // widget-host.js listener), so postMessage events would be dropped — queue locally.
  const isStandalone = mode === 'fullpage' || mode === 'schedule';
  const isEmbedded = window.parent && window.parent !== window && !isStandalone;

  if (isEmbedded) {
    // EMBEDDED MODE: Send to parent via postMessage
    // SR-1: concrete parent origin (never '*'); drop the event if none resolvable.
    const targetOrigin = resolveParentTargetOrigin({
      mode,
      referrer: document.referrer,
      locationOrigin: window.location.origin,
    });
    if (targetOrigin) {
      window.parent.postMessage({
        type: 'PICASSO_EVENT',
        event: eventType,
        payload: payload,
        analytics: analyticsEvent
      }, targetOrigin);
    }
  } else {
    // FULL-PAGE MODE: Queue events and send directly to backend
    // Initialize event queue if not exists
    if (!analyticsState.eventQueue) {
      analyticsState.eventQueue = [];
    }
    analyticsState.eventQueue.push(analyticsEvent);

    // Log in development mode for debugging
    if (import.meta.env.DEV) {
      console.log('📊 [Analytics] Event captured (full-page mode):', eventType, analyticsEvent);
    }

    // Dispatch custom event for any local listeners
    window.dispatchEvent(new CustomEvent('picasso-analytics-event', {
      detail: { event: eventType, payload, analytics: analyticsEvent }
    }));

    // Flush queue to backend (debounced to batch events)
    scheduleEventFlush();
  }
}

/**
 * Debounced flush of analytics events to backend.
 * Batches events to reduce API calls.
 */
let flushTimeout = null;
function scheduleEventFlush() {
  if (flushTimeout) return; // Already scheduled

  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushEventsToBackend();
  }, 1000); // Batch events over 1 second
}

/**
 * Send queued analytics events to backend.
 * Uses the Bedrock Streaming Handler's analytics endpoint.
 */
async function flushEventsToBackend() {
  if (!analyticsState.eventQueue || analyticsState.eventQueue.length === 0) return;

  const events = [...analyticsState.eventQueue];
  analyticsState.eventQueue = []; // Clear queue

  // Get the streaming endpoint (Bedrock Streaming Handler)
  const streamingEndpoint = environmentConfig.getStreamingEndpoint?.() ||
                            environmentConfig.STREAMING_ENDPOINT ||
                            '';

  // Build analytics endpoint URL
  const analyticsEndpoint = `${streamingEndpoint}?action=analytics`;

  // In development, log but still send to test the pipeline
  if (import.meta.env.DEV) {
    console.log('📊 [Analytics] Flushing', events.length, 'events to:', analyticsEndpoint);
  }

  try {
    const response = await fetch(analyticsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'analytics', // Include action in body for streaming handler routing
        batch: true,
        events: events
      }),
      keepalive: true // Ensure request completes even if page unloads
    });

    if (!response.ok) {
      throw new Error(`Analytics endpoint returned ${response.status}`);
    }

    const result = await response.json();
    if (import.meta.env.DEV) {
      console.log('📊 [Analytics] Flush successful:', result);
    }
  } catch (error) {
    console.warn('[Analytics] Failed to flush events:', error);
    // Re-queue failed events for retry, capped so a dead endpoint can't grow
    // the queue without bound (keep the most recent 200)
    analyticsState.eventQueue = [...events, ...(analyticsState.eventQueue || [])].slice(-200);
  }
}

// Expose notifyParentEvent globally for other components to use
window.notifyParentEvent = notifyParentEvent;

// Expose analytics state for components that need session_id
window.analyticsState = analyticsState;

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
          
        case 'POSITION_CHANGE':
          // Host resolved branding.chat_position from the tenant config —
          // mirror the closed-state internals (launcher anchor + callout
          // direction; see the `body.widget-left` block in ChatWidget.css).
          document.body.classList.toggle('widget-left', payload?.position === 'bottom-left');
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
          
        case 'SET_EDGE_MODE':
          // Flush widget to right edge — remove right border-radius and gaps
          if (payload?.enabled) {
            document.body.classList.add('edge-mode');
          } else {
            document.body.classList.remove('edge-mode');
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

      // Store tenant hash for analytics
      if (event.data.tenantHash) {
        analyticsState.tenantHash = event.data.tenantHash;
        console.log('✅ Parent confirmed tenant hash:', event.data.tenantHash);
        // Config will be fetched by normal flow - handshake complete
      }

      // Store host viewport width for mobile/desktop behavior resolution
      if (event.data.hostViewportWidth != null) {
        setHostViewportWidth(event.data.hostViewportWidth);
      }

      // Mirror closed-state internals when the host is left-anchored
      // (embed-snippet position; the tenant-config path arrives later via
      // the POSITION_CHANGE command).
      if (event.data.config?.position === 'bottom-left') {
        document.body.classList.add('widget-left');
      }

      // Store attribution data for analytics (GA4 client_id, UTM params, etc.)
      if (event.data.attribution) {
        analyticsState.attribution = event.data.attribution;
        console.log('📊 Attribution data received:', {
          ga_client_id: analyticsState.attribution.ga_client_id ? '✓' : '✗',
          utm_source: analyticsState.attribution.utm_source || '(none)',
          referrer: analyticsState.attribution.referrer ? 'present' : '(direct)'
        });
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
      // SR-1: concrete parent origin (never '*'); skip if none resolvable.
      const targetOrigin = resolveParentTargetOrigin({
        mode: new URLSearchParams(window.location.search).get('mode'),
        referrer: document.referrer,
        locationOrigin: window.location.origin,
      });
      if (targetOrigin) {
        window.parent.postMessage(healthStatus, targetOrigin);
      }
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
    const isFullpageMode = urlParams.get('mode') === 'fullpage';
    const isScheduleMode = urlParams.get('mode') === 'schedule';
    console.log('🔑 Using tenant hash:', tenantHash);
    console.log('📐 Fullpage mode:', isFullpageMode, '| Schedule mode:', isScheduleMode);

    // Set analytics state tenant hash immediately (needed for MESSAGE_SENT/RECEIVED events)
    analyticsState.tenantHash = tenantHash;

    // Set up config for iframe mode to use live API
    if (!window.PicassoConfig) {
      window.PicassoConfig = {
        mode: isScheduleMode ? 'schedule' : (isFullpageMode ? 'fullpage' : 'widget'),
        fullpage: isFullpageMode,
        tenant: tenantHash,
        tenant_id: tenantHash,
        iframe_mode: false  // Allow normal API loading
      };
      console.log('✅ Set iframe config to use live API with tenant hash:', tenantHash);
    }

    // In fullpage mode, apply fullpage styling and auto-open chat
    if (isFullpageMode) {
      document.body.classList.add('fullpage-mode', 'chat-open');
      document.documentElement.classList.add('fullpage-mode');
      console.log('📐 Fullpage mode enabled - chat auto-opened');
    }

    // In schedule mode, use the full viewport for the branded scheduling page (no widget
    // chrome / no auto-opened chat bubble — SchedulingPage renders the surface itself).
    if (isScheduleMode) {
      document.body.classList.add('fullpage-mode', 'schedule-mode');
      document.documentElement.classList.add('fullpage-mode');
      console.log('📐 Schedule mode enabled - branded scheduling page');
    }
    
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
    
    // Add a temporary loading indicator with CSS class
    // Hairline redesign (W4.4): unmocked pre-React placeholder, restyled to
    // the quiet Hairline palette (hairline-attachments.css) — no behavior
    // change, classnames only.
    container.innerHTML = '<div class="hairline-iframe-loading"><div>Loading Picasso…</div><div class="hairline-iframe-loading-subtitle">Iframe mode detected</div></div>';
    
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
            {/* Hairline redesign (W1.3): coexists with CSSVariablesProvider above —
                see HAIRLINE_WORKPLAN.md ground rule #8. Removed in W6.2. */}
            <HairlineThemeProvider>
              <FormModeProvider>
                <ChatProviderOrchestrator>
                  {isScheduleMode ? <SchedulingPage /> : <ChatWidget />}
                </ChatProviderOrchestrator>
              </FormModeProvider>
            </HairlineThemeProvider>
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

    // Send initial size state
    if (window.parent && window.parent !== window) {
      // SR-1: concrete parent origin (never '*'); skip the initial size post if none.
      const targetOrigin = resolveParentTargetOrigin({
        mode: new URLSearchParams(window.location.search).get('mode'),
        referrer: document.referrer,
        locationOrigin: window.location.origin,
      });
      const initialIsOpen = document.body.classList.contains('chat-open');

      // Calculate initial closed dimensions (will be updated by ChatWidget once it mounts)
      const initialDimensions = initialIsOpen
        ? { width: 380, height: 660 }
        : { width: 100, height: 100 }; // Placeholder - ChatWidget will send real dimensions

      if (targetOrigin) {
        window.parent.postMessage({
          type: 'PICASSO_SIZE_CHANGE',
          isOpen: initialIsOpen,
          dimensions: initialDimensions,
          initial: true
        }, targetOrigin);
        console.log(`📐 Sent initial SIZE_CHANGE to parent: ${initialIsOpen ? 'OPEN' : 'CLOSED'}`);
      }
    }

    // Listen for commands from host (PRD-compliant)
    setupCommandListener();

  } catch (error) {
    console.error("❌ Error initializing Picasso Widget:", error);
    // Show error in iframe with CSS class
    // Hairline redesign (W4.4): unmocked pre-React placeholder, restyled to
    // the quiet Hairline palette (hairline-attachments.css) — no behavior
    // change, classnames only.
    container.innerHTML = `<div class="hairline-iframe-error">
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