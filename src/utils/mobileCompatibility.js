/**
 * Mobile Safari Compatibility & PWA Support Utilities
 * Phase 3.3: Mobile Safari compatibility features and PWA support
 * Enhanced with Safari-specific SSE handling and background connection management
 */

import { errorLogger } from './errorHandling';
import { 
  isSafari, 
  isMobileSafari, 
  safariSSEBehaviors, 
  getOptimalSSEConfig 
} from './safariDetection';
import { 
  SSEConnectionManager, 
  SSE_CONNECTION_STATES 
} from './sseConnectionManager';

/**
 * Mobile Safari and iOS detection utilities
 */
export const isMobile = {
  iOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
  Safari: () => /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
  iOSSafari: () => isMobile.iOS() && isMobile.Safari(),
  Android: () => /Android/.test(navigator.userAgent),
  any: () => isMobile.iOS() || isMobile.Android()
};

/**
 * PWA detection and installation utilities
 */
export const pwa = {
  isInstalled: () => window.matchMedia('(display-mode: standalone)').matches ||
                    window.navigator.standalone === true,
  
  isInstallable: () => window.deferredPrompt !== null,
  
  canInstall: () => !pwa.isInstalled() && 'serviceWorker' in navigator,
  
  install: async () => {
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      const { outcome } = await window.deferredPrompt.userChoice;
      window.deferredPrompt = null;
      return outcome === 'accepted';
    }
    return false;
  }
};

/**
 * iOS Safari viewport and keyboard handling
 */
export class IOSSafariHandler {
  constructor() {
    this.initialViewportHeight = window.innerHeight;
    this.keyboardVisible = false;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    if (!isMobile.iOSSafari()) return;
    
    // Handle viewport changes for iOS Safari keyboard
    window.addEventListener('resize', this.handleViewportChange.bind(this));
    window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));
    
    // Handle focus events for input fields
    document.addEventListener('focusin', this.handleInputFocus.bind(this));
    document.addEventListener('focusout', this.handleInputBlur.bind(this));
    
    // Prevent double-tap zoom
    this.preventDoubleTabZoom();
    
    // Handle iOS Safari bottom bar hiding
    this.handleSafariChromeHiding();
  }
  
  handleViewportChange() {
    const currentHeight = window.innerHeight;
    const heightDifference = this.initialViewportHeight - currentHeight;
    
    // iOS Safari keyboard detection (rough estimation)
    this.keyboardVisible = heightDifference > 150;
    
    // Apply viewport fixes
    this.applyViewportFixes();
    
    // Notify parent of viewport change if in iframe
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_EVENT',
        event: 'VIEWPORT_CHANGE',
        payload: {
          keyboardVisible: this.keyboardVisible,
          viewportHeight: currentHeight,
          heightDifference
        }
      }, '*');
    }
  }
  
  handleOrientationChange() {
    // iOS Safari needs time to recalculate viewport after orientation change
    setTimeout(() => {
      this.initialViewportHeight = window.innerHeight;
      this.handleViewportChange();
    }, 500);
  }
  
  handleInputFocus(event) {
    if (!isMobile.iOSSafari()) return;
    
    // Scroll input into view and apply fixes
    setTimeout(() => {
      if (event.target && typeof event.target.scrollIntoView === 'function') {
        event.target.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
      
      // Apply keyboard-visible styles
      document.body.classList.add('ios-keyboard-visible');
    }, 100);
  }
  
  handleInputBlur() {
    if (!isMobile.iOSSafari()) return;
    
    // Remove keyboard styles with delay to ensure keyboard is hidden
    setTimeout(() => {
      document.body.classList.remove('ios-keyboard-visible');
    }, 300);
  }
  
  preventDoubleTabZoom() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, false);
  }
  
  handleSafariChromeHiding() {
    // Add padding for iOS Safari's dynamic viewport
    if (isMobile.iOSSafari()) {
      document.documentElement.style.setProperty('--ios-safe-area-top', 'env(safe-area-inset-top)');
      document.documentElement.style.setProperty('--ios-safe-area-bottom', 'env(safe-area-inset-bottom)');
    }
  }
  
  applyViewportFixes() {
    // Apply dynamic viewport height fix for iOS Safari
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Apply keyboard-specific fixes
    if (this.keyboardVisible) {
      document.body.classList.add('keyboard-visible');
    } else {
      document.body.classList.remove('keyboard-visible');
    }
  }
}

/**
 * Service Worker registration and management
 */
export class ServiceWorkerManager {
  constructor() {
    this.registration = null;
    this.updateAvailable = false;
  }
  
  async register() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return false;
    }
    
    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('🔧 Service Worker registered successfully');
      
      // Listen for updates
      this.registration.addEventListener('updatefound', this.handleUpdateFound.bind(this));
      
      // Check for immediate updates
      await this.registration.update();
      
      return true;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      errorLogger.logError(error, { context: 'service_worker_registration' });
      return false;
    }
  }
  
  handleUpdateFound() {
    const newWorker = this.registration.installing;
    
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        this.updateAvailable = true;
        this.notifyUpdateAvailable();
      }
    });
  }
  
  notifyUpdateAvailable() {
    // Dispatch custom event for update notification
    window.dispatchEvent(new CustomEvent('sw-update-available'));
    
    // Show user-friendly update notification
    console.log('🔄 App update available');
  }
  
  async skipWaiting() {
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }
}

/**
 * Offline conversation management
 * Integrates with Phase 3.2 conversation manager
 */
export class OfflineConversationSync {
  constructor(conversationManager) {
    this.conversationManager = conversationManager;
    this.isOnline = navigator.onLine;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }
  
  handleOnline() {
    this.isOnline = true;
    console.log('🌐 Connection restored - syncing conversations');
    this.syncOfflineConversations();
  }
  
  handleOffline() {
    this.isOnline = false;
    console.log('📴 Connection lost - enabling offline mode');
    this.enableOfflineMode();
  }
  
  async syncOfflineConversations() {
    if (!this.conversationManager) return;
    
    try {
      // Get pending conversations from conversation manager
      const conversations = this.conversationManager.getMessages();
      const offlineMessages = conversations.filter(msg => 
        msg.metadata && msg.metadata.offline
      );
      
      for (const message of offlineMessages) {
        try {
          // Attempt to send offline message
          await this.sendOfflineMessage(message);
          
          // Remove offline flag on success
          message.metadata.offline = false;
          message.metadata.synced = true;
          
        } catch (error) {
          console.error('❌ Failed to sync message:', message.id, error);
        }
      }
      
      if (offlineMessages.length > 0) {
        console.log(`✅ Synced ${offlineMessages.length} offline messages`);
      }
      
    } catch (error) {
      errorLogger.logError(error, { context: 'offline_conversation_sync' });
    }
  }
  
  async sendOfflineMessage(message) {
    // Implementation would depend on the specific API endpoint
    // This is a placeholder for the actual sync logic
    const response = await fetch('/Master_Function?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message.content,
        offline_sync: true,
        original_timestamp: message.timestamp
      })
    });
    
    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }
    
    return response.json();
  }
  
  enableOfflineMode() {
    // Add offline indicator to UI
    document.body.classList.add('offline-mode');
    
    // Show offline banner if not already visible
    this.showOfflineBanner();
  }
  
  showOfflineBanner() {
    const existingBanner = document.querySelector('.offline-banner');
    if (existingBanner) return;
    
    const banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.innerHTML = `
      <span>📴 You're offline. Messages will be sent when connection is restored.</span>
      <button onclick="this.parentElement.remove()">×</button>
    `;
    
    document.body.prepend(banner);
    
    // Auto-hide when back online
    const hideWhenOnline = () => {
      if (navigator.onLine) {
        banner.remove();
        document.body.classList.remove('offline-mode');
        window.removeEventListener('online', hideWhenOnline);
      }
    };
    
    window.addEventListener('online', hideWhenOnline);
  }
}

/**
 * PWA installation prompt manager
 */
export class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event;
      this.showInstallPrompt();
    });
    
    window.addEventListener('appinstalled', () => {
      console.log('📱 PWA installed successfully');
      this.hideInstallPrompt();
    });
  }
  
  showInstallPrompt() {
    // Create install prompt UI
    const installPrompt = document.createElement('div');
    installPrompt.className = 'pwa-install-prompt';
    installPrompt.innerHTML = `
      <div class="pwa-install-content">
        <span>📱 Install Picasso Chat for a better experience</span>
        <button class="pwa-install-btn">Install</button>
        <button class="pwa-dismiss-btn">×</button>
      </div>
    `;
    
    // Add event listeners
    installPrompt.querySelector('.pwa-install-btn').addEventListener('click', () => {
      this.promptInstall();
    });
    
    installPrompt.querySelector('.pwa-dismiss-btn').addEventListener('click', () => {
      this.hideInstallPrompt();
    });
    
    document.body.appendChild(installPrompt);
  }
  
  async promptInstall() {
    if (!this.deferredPrompt) return;
    
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('✅ User accepted PWA install');
    } else {
      console.log('❌ User dismissed PWA install');
    }
    
    this.deferredPrompt = null;
    this.hideInstallPrompt();
  }
  
  hideInstallPrompt() {
    const prompt = document.querySelector('.pwa-install-prompt');
    if (prompt) {
      prompt.remove();
    }
  }
}

/**
 * Safari SSE Connection Manager
 * Specialized connection manager for Safari SSE compatibility
 */
export class SafariSSEManager {
  constructor(config = {}) {
    this.config = {
      streamingEndpoint: config.streamingEndpoint || '',
      tenantHash: config.tenantHash || '',
      enableKeepAlive: true,
      enableBackgroundHandling: true,
      ...config
    };
    
    this.connectionManager = null;
    this.isActive = false;
    this.backgroundReconnectPending = false;
    
    // Safari-specific flags
    this.isSafari = isSafari();
    this.isMobileSafari = isMobileSafari();
    this.safariVersion = this._getSafariVersion();
    
    // Performance monitoring
    this.performanceMetrics = {
      connectionAttempts: 0,
      successfulConnections: 0,
      backgroundReconnections: 0,
      keepAlivesSent: 0,
      averageConnectionTime: 0
    };
    
    this._setupNetworkChangeHandling();
  }
  
  /**
   * Get Safari version for compatibility handling
   */
  _getSafariVersion() {
    if (!this.isSafari) return null;
    
    const match = navigator.userAgent.match(/Version\/(\d+)\.(\d+)/);
    return match ? parseFloat(`${match[1]}.${match[2]}`) : null;
  }
  
  /**
   * Setup network change event handling
   */
  _setupNetworkChangeHandling() {
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      navigator.connection?.addEventListener('change', () => {
        if (this.connectionManager && this.connectionManager.isConnected()) {
          errorLogger.logInfo('Network change detected, checking connection health', {
            context: 'safari_sse_network_change',
            effectiveType: navigator.connection.effectiveType,
            downlink: navigator.connection.downlink
          });
          
          // Safari tends to drop connections on network changes
          if (this.isSafari) {
            this._handleNetworkChange();
          }
        }
      });
    }
  }
  
  /**
   * Handle network change for Safari
   */
  _handleNetworkChange() {
    // Disconnect and reconnect after brief delay to handle network change
    setTimeout(() => {
      if (this.connectionManager && this.connectionManager.getState() === SSE_CONNECTION_STATES.CONNECTED) {
        this.connectionManager.disconnect();
        setTimeout(() => {
          this.connect();
        }, 2000); // 2 second delay for network stability
      }
    }, 1000);
  }
  
  /**
   * Initialize SSE connection with Safari optimizations
   */
  async connect() {
    if (!this.config.streamingEndpoint) {
      throw new Error('Streaming endpoint not configured for Safari SSE');
    }
    
    try {
      this.performanceMetrics.connectionAttempts++;
      
      // Create optimized SSE configuration for Safari
      const sseConfig = getOptimalSSEConfig();
      sseConfig.url = this.config.streamingEndpoint;
      sseConfig.tenantHash = this.config.tenantHash;
      
      // Safari-specific enhancements
      if (this.isSafari) {
        sseConfig.enableKeepAlive = true;
        sseConfig.enableBackgroundHandling = true;
        
        // Mobile Safari specific optimizations
        if (this.isMobileSafari) {
          sseConfig.keepAliveInterval = 30000; // 30 seconds
          sseConfig.backgroundTabTimeout = 60000; // 1 minute
          sseConfig.reconnectionDelay = 2000; // 2 seconds
        }
      }
      
      this.connectionManager = new SSEConnectionManager(sseConfig);
      
      // Setup event handlers
      this._setupConnectionEventHandlers();
      
      const connectionStartTime = Date.now();
      await this.connectionManager.connect();
      
      this.isActive = true;
      this.performanceMetrics.successfulConnections++;
      this.performanceMetrics.averageConnectionTime = 
        (this.performanceMetrics.averageConnectionTime + (Date.now() - connectionStartTime)) / 
        this.performanceMetrics.successfulConnections;
      
      errorLogger.logInfo('Safari SSE connection established', {
        context: 'safari_sse_connected',
        isMobileSafari: this.isMobileSafari,
        safariVersion: this.safariVersion,
        connectionTime: Date.now() - connectionStartTime
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'safari_sse_connection_error',
        isMobileSafari: this.isMobileSafari,
        endpoint: this.config.streamingEndpoint
      });
      throw error;
    }
  }
  
  /**
   * Setup connection event handlers for Safari optimizations
   */
  _setupConnectionEventHandlers() {
    if (!this.connectionManager) return;
    
    this.connectionManager.addEventListener('background_tab', () => {
      errorLogger.logInfo('Safari SSE handling background tab', {
        context: 'safari_sse_background'
      });
    });
    
    this.connectionManager.addEventListener('foreground_tab', () => {
      errorLogger.logInfo('Safari SSE handling foreground tab', {
        context: 'safari_sse_foreground'
      });
      
      // Check if reconnection is needed after returning from background
      if (this.backgroundReconnectPending) {
        this.backgroundReconnectPending = false;
        this.performanceMetrics.backgroundReconnections++;
        
        setTimeout(() => {
          if (this.connectionManager.getState() !== SSE_CONNECTION_STATES.CONNECTED) {
            this.connect();
          }
        }, 500);
      }
    });
    
    this.connectionManager.addEventListener('keep_alive', () => {
      this.performanceMetrics.keepAlivesSent++;
    });
    
    this.connectionManager.addEventListener('connection_error', (data) => {
      // Handle Safari-specific connection errors
      if (this.isSafari && data.reason.includes('network')) {
        this.backgroundReconnectPending = true;
      }
    });
  }
  
  /**
   * Disconnect Safari SSE connection
   */
  disconnect() {
    if (this.connectionManager) {
      this.connectionManager.disconnect();
      this.connectionManager = null;
    }
    
    this.isActive = false;
    this.backgroundReconnectPending = false;
    
    errorLogger.logInfo('Safari SSE disconnected', {
      context: 'safari_sse_disconnected',
      metrics: this.performanceMetrics
    });
  }
  
  /**
   * Get connection state
   */
  getConnectionState() {
    return this.connectionManager?.getState() || SSE_CONNECTION_STATES.DISCONNECTED;
  }
  
  /**
   * Check if connection is healthy
   */
  isConnectionHealthy() {
    return this.connectionManager?.isConnected() || false;
  }
  
  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      connectionState: this.getConnectionState(),
      isHealthy: this.isConnectionHealthy(),
      safariVersion: this.safariVersion,
      isMobileSafari: this.isMobileSafari
    };
  }
}

/**
 * Background Connection Manager
 * Handles SSE connections during background tab scenarios for Safari
 */
export class BackgroundConnectionManager {
  constructor() {
    this.activeConnections = new Map();
    this.backgroundStartTime = null;
    this.isInBackground = false;
    
    this._setupVisibilityHandling();
  }
  
  /**
   * Setup visibility change handling
   */
  _setupVisibilityHandling() {
    if (typeof document === 'undefined') return;
    
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.isInBackground) {
        this._handleEnterBackground();
      } else if (!document.hidden && this.isInBackground) {
        this._handleExitBackground();
      }
    });
  }
  
  /**
   * Handle entering background
   */
  _handleEnterBackground() {
    this.isInBackground = true;
    this.backgroundStartTime = Date.now();
    
    errorLogger.logInfo('Entering background mode', {
      context: 'background_connection_manager',
      activeConnections: this.activeConnections.size,
      isMobileSafari: isMobileSafari()
    });
    
    // Notify all registered connections
    for (const [id, connection] of this.activeConnections) {
      if (connection.onBackground) {
        connection.onBackground();
      }
    }
  }
  
  /**
   * Handle exiting background
   */
  _handleExitBackground() {
    const backgroundDuration = this.backgroundStartTime ? 
      Date.now() - this.backgroundStartTime : 0;
    
    this.isInBackground = false;
    this.backgroundStartTime = null;
    
    errorLogger.logInfo('Exiting background mode', {
      context: 'background_connection_manager',
      backgroundDuration,
      activeConnections: this.activeConnections.size,
      isMobileSafari: isMobileSafari()
    });
    
    // Notify all registered connections
    for (const [id, connection] of this.activeConnections) {
      if (connection.onForeground) {
        connection.onForeground(backgroundDuration);
      }
    }
  }
  
  /**
   * Register connection for background management
   */
  registerConnection(id, connection) {
    this.activeConnections.set(id, connection);
    
    errorLogger.logInfo('Connection registered for background management', {
      context: 'background_connection_register',
      connectionId: id,
      totalConnections: this.activeConnections.size
    });
  }
  
  /**
   * Unregister connection
   */
  unregisterConnection(id) {
    this.activeConnections.delete(id);
    
    errorLogger.logInfo('Connection unregistered from background management', {
      context: 'background_connection_unregister',
      connectionId: id,
      totalConnections: this.activeConnections.size
    });
  }
  
  /**
   * Get background status
   */
  getStatus() {
    return {
      isInBackground: this.isInBackground,
      backgroundDuration: this.backgroundStartTime ? 
        Date.now() - this.backgroundStartTime : 0,
      activeConnections: this.activeConnections.size
    };
  }
}

/**
 * Initialize all mobile compatibility features with Safari SSE support
 */
export async function initializeMobileCompatibility(conversationManager = null) {
  try {
    console.log('🚀 Initializing mobile compatibility features with Safari SSE support...');
    
    // Initialize iOS Safari handler
    const iosHandler = new IOSSafariHandler();
    
    // Register service worker
    const swManager = new ServiceWorkerManager();
    await swManager.register();
    
    // Initialize offline sync if conversation manager is provided
    let offlineSync = null;
    if (conversationManager) {
      offlineSync = new OfflineConversationSync(conversationManager);
    }
    
    // Initialize PWA install manager
    const pwaInstaller = new PWAInstallManager();
    
    // Initialize Safari SSE manager if Safari is detected
    let safariSSEManager = null;
    if (isSafari()) {
      safariSSEManager = new SafariSSEManager();
      console.log('✅ Safari SSE Manager initialized');
    }
    
    // Initialize background connection manager
    const backgroundConnectionManager = new BackgroundConnectionManager();
    
    console.log('✅ Mobile compatibility initialized successfully');
    
    return {
      iosHandler,
      swManager,
      offlineSync,
      pwaInstaller,
      safariSSEManager,
      backgroundConnectionManager,
      isSafari: isSafari(),
      isMobileSafari: isMobileSafari(),
      safariSSEBehaviors: safariSSEBehaviors
    };
    
  } catch (error) {
    console.error('❌ Failed to initialize mobile compatibility:', error);
    errorLogger.logError(error, { context: 'mobile_compatibility_init' });
    return null;
  }
}

// All classes are exported individually above for direct use and testing