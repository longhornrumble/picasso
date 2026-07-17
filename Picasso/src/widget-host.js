/**
 * Picasso Widget Host Script
 * Creates iframe with complete CSS isolation for the chat widget
 * Uses your existing React app, theme.css, and useCSSVariables system
 */

import { config as environmentConfig } from './config/environment.js';
import { getBindingSessionId } from './utils/bindingSession.js';
import {
  captureAttribution as captureAttributionShared,
  getEntryPointId as getEntryPointIdShared,
  getGAClientId as getGAClientIdShared,
  getUrlParam as getUrlParamShared
} from './utils/attribution.js';

(function() {
  'use strict';

  // Dynamic-viewport height where the browser supports it (Safari 15.4+,
  // Chrome 108+, FF 101+). On iOS Safari, `100vh` is the LARGEST viewport
  // (address bar collapsed) — so a 100vh mobile sheet's composer/footer sat
  // hidden under the EXPANDED browser chrome (Chris's iPhone 12 Pro Max
  // report, 2026-07-03). `100dvh` tracks the real visible viewport as the
  // bar expands/collapses: full-bleed when collapsed, no dead space, no
  // hidden composer. Older browsers keep the 100vh behavior they had.
  const VIEWPORT_H =
    (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('height', '100dvh'))
      ? '100dvh'
      : '100vh';

  const PicassoWidget = {
    iframe: null,
    container: null,
    isOpen: false,
    tenantHash: null,
    config: {
      // Default configuration - will be overridden by tenant config
      position: 'bottom-right',
      minimizedSize: '56px',
      // Hairline shell dims (HAIRLINE_WORKPLAN.md W6.1): fixed 380 × min(640px,
      // viewport-48px) panel. No more edge/adaptive-height growth (D1 default —
      // see docs/HAIRLINE_REDESIGN_MAPPING.md §7) — the panel no longer resizes
      // itself after the first message, so there is no separate "active" height.
      // Dynamic-viewport unit so the bottom-anchored panel also stays fully
      // visible on tablets with collapsing browser chrome.
      expandedWidth: '380px',
      expandedHeight: `min(640px, calc(${VIEWPORT_H} - 48px))`,
      zIndex: 10000
    },
    attribution: null, // Captured on init for analytics

    // ========================================================================
    // ATTRIBUTION CAPTURE (for User Journey Analytics)
    // See: /docs/User_Journey/USER_JOURNEY_ANALYTICS_PLAN.md
    // ========================================================================

    // ------------------------------------------------------------------
    // Attribution capture lives in ./utils/attribution.js — the single
    // source of truth, shared with the /go/ fullpage launcher (which has no
    // host page of its own to capture from) and directly unit-tested there.
    //
    // These stay as thin delegates rather than being deleted: init() returns
    // globalWidgetInstance (an Object.create(PicassoWidget)), which inherits
    // them via the prototype chain, so an embedder holding that return value
    // can reach them. Undocumented and unused in-repo, but not provably
    // unused in the wild — so the surface is preserved.
    // ------------------------------------------------------------------

    /**
     * Capture GA4 client_id from the _ga cookie for session stitching.
     * @returns {string|null} GA4 client_id or null if not found
     */
    getGAClientId() {
      return getGAClientIdShared();
    },

    /**
     * Get a URL parameter from the current page.
     * @param {string} name - Parameter name
     * @returns {string|null} Parameter value or null
     */
    getUrlParam(name) {
      return getUrlParamShared(name);
    },

    /**
     * C2: validate and capture the ?ep= entry-point id from the page URL.
     * @returns {string|null}
     */
    getEntryPointId() {
      return getEntryPointIdShared();
    },

    /**
     * Capture all attribution data from the parent page.
     * Called once during widget initialization.
     * @returns {Object} Attribution data object
     */
    captureAttribution() {
      return captureAttributionShared();
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
      // C1.3: emit PAGE_VIEW reach ping from loader (independent of iframe).
      // emitReachPing() is async — it fetches the S3 tenant config first so
      // the operator-side REACH_PING kill switch (C8.9 / F3) is honoured
      // without requiring changes to the embedding tenant site.
      this.emitReachPing();
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

      // Forward the transport override so HTTP vs streaming can be tested
      // independently from the host page (?streaming=false|true — read by
      // config/streaming-config.js inside the iframe).
      const streamingParam = urlParams.get('streaming');
      if (streamingParam === 'false' || streamingParam === 'true') {
        iframeUrl += `&streaming=${streamingParam}`;
      }

      // Scheduling redemption: forward the opaque ?session=<uuid> binding id from the host
      // page into the iframe so the in-iframe chat request can carry it to the backend (§B12).
      const bindingSessionId = getBindingSessionId(window.location.search);
      if (bindingSessionId) {
        iframeUrl += `&session=${encodeURIComponent(bindingSessionId)}`;
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
        // Source check FIRST, and null-safe: any other script on the embedding
        // page can postMessage(null) — reading .type before the check threw.
        if (event.source !== this.iframe.contentWindow) {
          return;
        }
        if (!event.data || typeof event.data.type !== 'string') {
          return;
        }
        console.log('📨 Host received message:', event.data.type, 'from:', event.origin);

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
            }, this.iframeOrigin || '*');
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
          // Edge/adaptive-height mode retired (D1 default) — the shell no
          // longer grows after the first message. No-op kept so this event
          // doesn't fall through to the "Unknown PICASSO_EVENT" log below.
          console.log('💬 Message sent event received');
          break;

        case 'SESSION_CLEARED':
          console.log('🔄 Session cleared event received');
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

      // Resolve streaming endpoint: tenant config → env config getter → env config default.
      // Empty fallback yields a relative URL that 404s on the embedding host (silent
      // analytics drop). Production analytics ingestion stalled 4/15–5/1 from this gap.
      const streamingEndpoint = this.config?.streamingEndpoint ||
                                environmentConfig.getStreamingEndpoint?.() ||
                                environmentConfig.STREAMING_ENDPOINT ||
                                '';
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
        // Re-queue failed events, capped so a dead endpoint can't grow the
        // queue without bound (keep the most recent 200)
        this.analyticsQueue = [...events, ...this.analyticsQueue].slice(-200);
      }
    },
    
    // ========================================================================
    // C1.3 PAGE_VIEW REACH PING
    // Emitted by the loader, independent of the iframe.
    // All emission goes through emitReachPing() — single consent/GPC choke point (C8.9).
    // MUST NOT set cookies or write localStorage (C8.3).
    // Payload allow-list is EXHAUSTIVE per C8.1-2 — do not add fields.
    // ========================================================================

    /**
     * Build the C1.3-compliant device_class string from window dimensions.
     * Breakpoints mirror the widget's expand() logic.
     * @returns {"mobile"|"tablet"|"desktop"}
     */
    _getDeviceClass() {
      const w = window.innerWidth;
      if (w <= 768) return 'mobile';
      if (w <= 1024) return 'tablet';
      return 'desktop';
    },

    /**
     * Fetch the S3 tenant config (same GET the iframe uses; CDN-cached).
     * Returns the parsed JSON config object, or null on any failure.
     * Used by emitReachPing() to honour the operator-side REACH_PING kill
     * switch (C8.9 / F3) without requiring changes to the embedding site.
     *
     * @returns {Promise<Object|null>}
     */
    async _fetchTenantConfig() {
      try {
        const configUrl = environmentConfig.getConfigUrl(this.tenantHash);
        const resp = await fetch(configUrl, {
          method: 'GET',
          // 4-second timeout (config is CDN-cached; slow = infra problem)
          signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : (() => {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 4000);
            return ctrl.signal;
          })()
        });
        if (!resp.ok) return null;
        return await resp.json();
      } catch {
        return null;
      }
    },

    /**
     * Emit a PAGE_VIEW ping via the existing analytics transport.
     * All C1.3 constraints enforced here; callers pass no arguments.
     *
     * Kill switch (C8.9 / F3): fires ONLY when feature_flags.REACH_PING !== false
     * in EITHER the embed-snippet customConfig OR the S3 tenant config.
     * EITHER source can disable (operator doesn't need a site deploy to turn off).
     * Fail closed — no ping if the tenant config cannot be fetched.
     *
     * This function is async; the caller (init) does not await it so the
     * widget continues loading while the config fetch + ping happen in background.
     */
    async emitReachPing() {
      // Kill switch — embed-snippet side (fast path, no network required).
      // If the embed explicitly disables, bail before the config fetch.
      if (this.config?.feature_flags?.REACH_PING === false) return;

      // Kill switch — S3 tenant config side (C8.9 / F3 operator control).
      // Fetch the same config the iframe fetches (CDN-cached GET).
      // Fail closed: if the fetch fails, do NOT ping (C1.3: "fail closed").
      const tenantConfig = await this._fetchTenantConfig();
      if (tenantConfig === null) return; // fail closed

      // Merge: EITHER source can disable (logical AND — both must be non-false).
      const tenantFlags = tenantConfig?.feature_flags ?? tenantConfig?.config?.feature_flags ?? {};
      if (tenantFlags.REACH_PING === false) return;

      try {
        // pv_ session identity — sessionStorage only, no cookie, no localStorage (C8.3)
        const PV_SESSION_KEY = '_pv_sid';
        const PV_SEEN_KEY = '_pv_seen';
        const PV_STEP_KEY = '_pv_step';
        const PV_COUNT_KEY = '_pv_count';

        let pvSession;
        try {
          pvSession = sessionStorage.getItem(PV_SESSION_KEY);
          if (!pvSession) {
            pvSession = 'pv_' + Math.random().toString(36).substring(2, 10) +
                        Math.random().toString(36).substring(2, 10);
            sessionStorage.setItem(PV_SESSION_KEY, pvSession);
          }
        } catch {
          // sessionStorage unavailable (privacy mode) — fail closed per C1.3
          return;
        }

        const pathname = window.location.pathname.slice(0, 512);

        // Throttle: once per (pathname, tab session) (C1.3 / C8.5)
        let seen;
        try {
          seen = new Set(JSON.parse(sessionStorage.getItem(PV_SEEN_KEY) || '[]'));
        } catch {
          return; // fail closed
        }
        if (seen.has(pathname)) return;

        // Hard cap: 100 pings per session (C1.3 / C8.5)
        let count;
        try {
          count = parseInt(sessionStorage.getItem(PV_COUNT_KEY) || '0', 10);
        } catch {
          return; // fail closed
        }
        if (count >= 100) return;

        // Mark seen and increment counter
        try {
          seen.add(pathname);
          sessionStorage.setItem(PV_SEEN_KEY, JSON.stringify([...seen]));
          sessionStorage.setItem(PV_COUNT_KEY, String(count + 1));
        } catch {
          return; // fail closed if storage throws mid-write
        }

        // Step counter for envelope ordering
        let stepNumber;
        try {
          stepNumber = parseInt(sessionStorage.getItem(PV_STEP_KEY) || '0', 10) + 1;
          sessionStorage.setItem(PV_STEP_KEY, String(stepNumber));
        } catch {
          stepNumber = count + 1; // fallback
        }

        // Referrer host — hostname only, never full referrer (C8.2)
        let referrerHost = null;
        try {
          if (document.referrer) {
            referrerHost = new URL(document.referrer).hostname || null;
          }
        } catch { /* malformed referrer — leave null */ }

        // Build envelope (C1.0 shape, adapted for loader context)
        const envelope = {
          schema_version: '1.0.0',
          tenant_id: this.tenantHash,
          session_id: pvSession,
          timestamp: new Date().toISOString(),
          step_number: stepNumber,
          event: {
            type: 'PAGE_VIEW',
            // Payload allow-list EXHAUSTIVE (C8.1-2) — no other fields permitted
            payload: {
              path: pathname,
              referrer_host: referrerHost,
              device_class: this._getDeviceClass()
            }
          }
        };

        // Add ga_client_id read-only from _ga cookie — no write (C8.3)
        const gaClientId = this.getGAClientId();
        if (gaClientId) {
          envelope.ga_client_id = gaClientId;
        }

        this.queueAnalyticsEvent(envelope);
        // IDs and counts only — no payload logging (C8.10)
        console.log('[Picasso] PAGE_VIEW queued:', pvSession, 'step', stepNumber);
      } catch (err) {
        // Never surface errors on tenant pages
        console.warn('[Picasso] PAGE_VIEW skipped:', err && err.message);
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

      // Hairline shell breakpoint (D6 default): full-screen sheet at ≤480px
      // viewport width; fixed 380×min(640px, 100vh-48px) panel otherwise.
      // The old 768/1024 mobile/tablet tiers and the edge/adaptive-height
      // growth behavior (D1 default) are retired — see
      // docs/HAIRLINE_REDESIGN_MAPPING.md §7 D1/D6.
      const isMobile = window.innerWidth <= 480;

      if (isMobile) {
        // Full-screen sheet — edge-to-edge, no margins, no radius.
        // Height uses the dynamic viewport unit (VIEWPORT_H) so the sheet's
        // composer/footer track the visible viewport instead of hiding
        // under mobile browser chrome.
        Object.assign(this.container.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          bottom: '0',
          right: '0',
          width: '100vw',
          height: VIEWPORT_H,
          zIndex: this.config.zIndex + 1000
        });
      } else {
        // Desktop: fixed shell panel — dimensions from config
        Object.assign(this.container.style, {
          width: this.config.expandedWidth,
          height: this.config.expandedHeight,
          top: 'auto',
          bottom: '20px',
          right: '20px',
          left: 'auto'
        });
      }

      this.iframe.style.borderRadius = isMobile ? '0' : '12px';
      // Shell shadow (DESIGN_SPEC.md "Widget Shell": 0 2px 24px
      // rgba(15,23,42,0.08)) lives on the host iframe — a fixed, non-tenant
      // value. The shell's own box-shadow can't bleed past the iframe edge,
      // so the desktop panel needs it here (W6.3 audit fix F3). The sheet
      // and the closed launcher/callout states carry no panel shadow.
      this.iframe.style.boxShadow = isMobile ? 'none' : '0 2px 24px rgba(15, 23, 42, 0.08)';
      this.notifyViewportTier(isMobile);

      console.log(`📈 Widget expanded - ${isMobile ? 'mobile' : 'desktop'} mode`);
    },

    // Tell the iframe which viewport tier the HOST is in (W6.3 audit fix
    // F3): inside the iframe, media queries see only the iframe's own
    // ~380px viewport, so the ≤480 mobile-sheet decision (D6) must come
    // from out here. iframe-main.jsx's pre-existing SIZE_CHANGE command
    // handler maps this onto the `iframe-mobile`/`iframe-desktop` body
    // classes that hairline-shell.css gates the sheet styling on.
    notifyViewportTier(isMobile) {
      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type: 'PICASSO_COMMAND',
          action: 'SIZE_CHANGE',
          payload: { size: isMobile ? 'mobile' : 'desktop', isMobile }
        }, this.iframeOrigin || '*');
      }
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
        borderRadius: '50%',
        boxShadow: 'none'
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
        borderRadius: isSquare ? '50%' : '12px',
        // Closed-state dims (launcher / launcher+callout) — no panel shadow.
        boxShadow: 'none'
      });

      console.log(`📏 Applied dimensions: ${dimensions.width}x${dimensions.height}px at bottom-right corner`);
    },
    
    // Setup resize observer for responsive behavior
    setupResizeObserver() {
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
          if (this.isOpen) {
            // Re-apply mobile/desktop sizing — mirrors expand()'s ≤480 breakpoint
            const isMobile = window.innerWidth <= 480;
            if (isMobile) {
              Object.assign(this.container.style, {
                top: '0',
                left: '0',
                bottom: '0',
                right: '0',
                width: '100vw',
                height: VIEWPORT_H
              });
            } else {
              Object.assign(this.container.style, {
                width: this.config.expandedWidth,
                height: this.config.expandedHeight,
                bottom: '20px',
                right: '20px',
                top: 'auto',
                left: 'auto'
              });
            }
            this.iframe.style.borderRadius = isMobile ? '0' : '12px';
            this.iframe.style.boxShadow = isMobile ? 'none' : '0 2px 24px rgba(15, 23, 42, 0.08)';
            this.notifyViewportTier(isMobile);
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
          // Only accept events from our own iframe — any frame could spoof
          // a PICASSO_EVENT into the tenant page's callback otherwise.
          if (!globalWidgetInstance?.iframe ||
              event.source !== globalWidgetInstance.iframe.contentWindow) {
            return;
          }
          if (event.data && event.data.type === 'PICASSO_EVENT') {
            callback(event.data);
          }
        });
      }
    }
  };
  
  // Auto-initialize if this script was loaded with data-tenant
  autoInit();
  
})(); // Force rebuild Thu Oct 30 10:20:49 CDT 2025
