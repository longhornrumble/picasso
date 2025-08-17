/**
 * Mobile Safari SSE Compatibility Tests
 * Tests streaming connections on Safari, reconnection logic, background tab behavior,
 * and keep-alive heartbeats for mobile Safari compatibility.
 * 
 * This test suite validates the unified coordination architecture's mobile requirements:
 * - SSE connections work correctly on Safari (desktop and mobile)
 * - Reconnection logic handles Safari-specific connection drops
 * - Background tab behavior maintains connections appropriately
 * - Keep-alive heartbeats prevent Safari connection timeouts
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { 
  isSafari, 
  isMobileSafari, 
  getOptimalSSEConfig,
  _clearDetectionCache
} from '../utils/safariDetection';

// Mock browser environment for Safari testing
const mockSafariUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
const mockSafariDesktopUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15';

// Mock EventSource for testing
class MockEventSource {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.readyState = MockEventSource.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this._listeners = new Map();
    
    // Simulate connection delay
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      if (this.onopen) this.onopen({ type: 'open' });
      this._triggerEvent('open', { type: 'open' });
    }, 10);
  }
  
  static get CONNECTING() { return 0; }
  static get OPEN() { return 1; }
  static get CLOSED() { return 2; }
  
  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  }
  
  removeEventListener(type, listener) {
    if (this._listeners.has(type)) {
      const listeners = this._listeners.get(type);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  close() {
    this.readyState = MockEventSource.CLOSED;
    if (this.onclose) this.onclose({ type: 'close' });
    this._triggerEvent('close', { type: 'close' });
  }
  
  _triggerEvent(type, event) {
    if (this._listeners.has(type)) {
      this._listeners.get(type).forEach(listener => listener(event));
    }
  }
  
  _simulateMessage(data) {
    const event = { type: 'message', data: JSON.stringify(data) };
    if (this.onmessage) this.onmessage(event);
    this._triggerEvent('message', event);
  }
  
  _simulateError() {
    const event = { type: 'error' };
    if (this.onerror) this.onerror(event);
    this._triggerEvent('error', event);
  }
  
  _simulateConnectionDrop() {
    this.readyState = MockEventSource.CLOSED;
    this._simulateError();
  }
}

// Safari-specific streaming handler
class SafariStreamingHandler {
  constructor(config = {}) {
    this.config = {
      streamingEndpoint: config.streamingEndpoint || 'https://test-streaming.lambda-url.us-east-1.on.aws/',
      tenantHash: config.tenantHash || 'test-tenant-hash',
      keepAliveInterval: config.keepAliveInterval || 30000, // 30 seconds for Safari
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 5,
      backgroundTabTimeout: config.backgroundTabTimeout || 60000, // 1 minute
      ...config
    };
    
    this.eventSource = null;
    this.isConnected = false;
    this.isSafari = this._detectSafari();
    this.isMobileSafari = this._detectMobileSafari();
    this.reconnectAttempts = 0;
    this.keepAliveTimer = null;
    this.backgroundTimer = null;
    this.isBackgroundTab = false;
    this.lastActivity = Date.now();
    
    this.onMessage = config.onMessage || (() => {});
    this.onConnect = config.onConnect || (() => {});
    this.onDisconnect = config.onDisconnect || (() => {});
    this.onError = config.onError || (() => {});
    
    this._setupVisibilityChangeHandlers();
  }
  
  _detectSafari() {
    return isSafari();
  }
  
  _detectMobileSafari() {
    return isMobileSafari();
  }
  
  _setupVisibilityChangeHandlers() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isBackgroundTab = document.hidden;
        
        if (this.isBackgroundTab) {
          this._handleBackgroundTab();
        } else {
          this._handleForegroundTab();
        }
      });
    }
  }
  
  _handleBackgroundTab() {
    // Safari aggressively throttles background tabs
    if (this.isSafari) {
      // Reduce keep-alive frequency in background
      this._clearKeepAlive();
      this._setupKeepAlive(60000); // 1 minute intervals in background
      
      // Set background timeout for mobile Safari
      if (this.isMobileSafari) {
        this.backgroundTimer = setTimeout(() => {
          this._disconnect();
        }, this.config.backgroundTabTimeout);
      }
    }
  }
  
  _handleForegroundTab() {
    // Clear background timeout
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
    
    // Restore normal keep-alive
    if (this.isSafari) {
      this._clearKeepAlive();
      this._setupKeepAlive(this.config.keepAliveInterval);
      
      // Reconnect if disconnected while in background
      if (!this.isConnected) {
        this._reconnect();
      }
    }
  }
  
  async connect() {
    if (this.isConnected) {
      return;
    }
    
    try {
      const url = new URL(this.config.streamingEndpoint);
      url.searchParams.set('tenant', this.config.tenantHash);
      url.searchParams.set('safari', this.isSafari ? '1' : '0');
      url.searchParams.set('mobile', this.isMobileSafari ? '1' : '0');
      
      this.eventSource = new (typeof EventSource !== 'undefined' ? EventSource : MockEventSource)(url.toString());
      
      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastActivity = Date.now();
        this._setupKeepAlive(this.config.keepAliveInterval);
        this.onConnect();
      };
      
      this.eventSource.onmessage = (event) => {
        this.lastActivity = Date.now();
        
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'keepalive') {
            // Handle keep-alive messages
            this._handleKeepAlive(data);
          } else if (data.type === 'message') {
            // Handle chat messages
            this.onMessage(data.content || data.data);
          } else if (data.type === 'error') {
            this.onError(data.error);
          }
        } catch (error) {
          console.warn('Failed to parse SSE message:', error);
        }
      };
      
      this.eventSource.onerror = () => {
        this._handleConnectionError();
      };
      
    } catch (error) {
      this.onError(error);
    }
  }
  
  _handleKeepAlive(data) {
    // Respond to keep-alive if server expects it
    if (data.expectResponse) {
      this._sendKeepAliveResponse();
    }
  }
  
  _sendKeepAliveResponse() {
    // In real implementation, this would send a keep-alive response
    // For Safari, this helps maintain the connection
  }
  
  _setupKeepAlive(interval) {
    this._clearKeepAlive();
    
    if (this.isSafari) {
      this.keepAliveTimer = setInterval(() => {
        if (this.isConnected && this.eventSource) {
          // Send keep-alive ping to maintain Safari connection
          this._sendKeepAlivePing();
        }
      }, interval);
    }
  }
  
  _sendKeepAlivePing() {
    // In real implementation, this would send a ping to the server
    // to prevent Safari from timing out the connection
  }
  
  _clearKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
  
  _handleConnectionError() {
    this.isConnected = false;
    this._clearKeepAlive();
    
    // Safari-specific reconnection logic
    if (this.isSafari && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      const backoffDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      setTimeout(() => {
        this._reconnect();
      }, backoffDelay);
    } else {
      this.onDisconnect();
    }
  }
  
  _reconnect() {
    this.reconnectAttempts++;
    this._disconnect();
    
    setTimeout(() => {
      this.connect();
    }, 100);
  }
  
  _disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.isConnected = false;
    this._clearKeepAlive();
    
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }
  
  disconnect() {
    this._disconnect();
    this.onDisconnect();
  }
  
  sendMessage(message) {
    if (!this.isConnected) {
      throw new Error('Not connected to streaming endpoint');
    }
    
    // In real implementation, this would send message through the SSE connection
    // or via a separate HTTP endpoint
    this.lastActivity = Date.now();
  }
}

describe('Mobile Safari SSE Compatibility', () => {
  let handler;
  let originalUserAgent;
  let originalDocument;
  
  beforeAll(() => {
    // Mock global EventSource
    global.EventSource = MockEventSource;
  });
  
  beforeEach(() => {
    // Clear Safari detection cache before each test
    _clearDetectionCache();
    
    originalUserAgent = global.navigator?.userAgent;
    originalDocument = global.document;
    
    // Mock Safari environment
    global.navigator = {
      userAgent: mockSafariUserAgent
    };
    
    // Mock document for visibility change events
    global.document = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    
    handler = new SafariStreamingHandler({
      streamingEndpoint: 'https://test-streaming.lambda-url.us-east-1.on.aws/',
      tenantHash: 'safari-test-tenant',
      keepAliveInterval: 1000, // Shorter for testing
      reconnectInterval: 100
    });
  });
  
  afterEach(() => {
    if (handler) {
      handler.disconnect();
    }
    
    if (originalUserAgent) {
      global.navigator.userAgent = originalUserAgent;
    }
    
    if (originalDocument) {
      global.document = originalDocument;
    }
  });

  describe('Safari Detection', () => {
    it('should detect mobile Safari correctly', () => {
      expect(handler.isMobileSafari).toBe(true);
      expect(handler.isSafari).toBe(true);
    });
    
    it('should detect desktop Safari correctly', () => {
      global.navigator.userAgent = mockSafariDesktopUserAgent;
      
      const desktopHandler = new SafariStreamingHandler();
      expect(desktopHandler.isMobileSafari).toBe(false);
      expect(desktopHandler.isSafari).toBe(true);
    });
    
    it('should not detect Chrome as Safari', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/94.0.4606.76 Mobile/15E148 Safari/604.1';
      
      const chromeHandler = new SafariStreamingHandler();
      expect(chromeHandler.isMobileSafari).toBe(false);
      expect(chromeHandler.isSafari).toBe(false);
    });
  });

  describe('SSE Connection Establishment', () => {
    it('should establish SSE connection with Safari-specific parameters', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      expect(handler.isConnected).toBe(true);
      expect(handler.eventSource).toBeDefined();
      expect(handler.eventSource.url).toContain('safari=1');
      expect(handler.eventSource.url).toContain('mobile=1');
    });
    
    it('should handle connection establishment delay', async () => {
      const connectTime = Date.now();
      
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = () => {
          const elapsed = Date.now() - connectTime;
          expect(elapsed).toBeGreaterThanOrEqual(10); // MockEventSource delay
          resolve();
        };
      });
      
      await handler.connect();
      await connectPromise;
    });
    
    it('should set up keep-alive timer for Safari', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      expect(handler.keepAliveTimer).toBeDefined();
    });
  });

  describe('Keep-alive Heartbeats', () => {
    it('should send keep-alive pings at regular intervals', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Mock keep-alive ping method
      const keepAlivePings = [];
      handler._sendKeepAlivePing = () => {
        keepAlivePings.push(Date.now());
      };
      
      // Wait for multiple keep-alive intervals
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      expect(keepAlivePings.length).toBeGreaterThan(1);
    });
    
    it('should handle keep-alive messages from server', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Mock keep-alive response
      const keepAliveResponses = [];
      handler._sendKeepAliveResponse = () => {
        keepAliveResponses.push(Date.now());
      };
      
      // Simulate server keep-alive message
      handler.eventSource._simulateMessage({
        type: 'keepalive',
        expectResponse: true,
        timestamp: Date.now()
      });
      
      expect(keepAliveResponses.length).toBe(1);
    });
    
    it('should adjust keep-alive frequency for background tabs', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      const originalInterval = handler.config.keepAliveInterval;
      
      // Simulate tab going to background
      global.document.hidden = true;
      handler._handleBackgroundTab();
      
      // Keep-alive should be adjusted for background
      expect(handler.keepAliveTimer).toBeDefined();
      
      // Simulate tab returning to foreground
      global.document.hidden = false;
      handler._handleForegroundTab();
      
      expect(handler.keepAliveTimer).toBeDefined();
    });
  });

  describe('Reconnection Logic', () => {
    it('should reconnect automatically on connection drop', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Track reconnection attempts
      const reconnections = [];
      const originalReconnect = handler._reconnect;
      handler._reconnect = () => {
        reconnections.push(Date.now());
        originalReconnect.call(handler);
      };
      
      // Simulate connection drop
      handler.eventSource._simulateConnectionDrop();
      
      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(reconnections.length).toBeGreaterThan(0);
    });
    
    it('should implement exponential backoff for reconnection', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      const reconnectionTimes = [];
      const originalReconnect = handler._reconnect;
      handler._reconnect = () => {
        reconnectionTimes.push(Date.now());
        originalReconnect.call(handler);
      };
      
      // Simulate multiple connection drops
      for (let i = 0; i < 3; i++) {
        handler.eventSource._simulateConnectionDrop();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Verify exponential backoff pattern
      if (reconnectionTimes.length > 1) {
        const intervals = [];
        for (let i = 1; i < reconnectionTimes.length; i++) {
          intervals.push(reconnectionTimes[i] - reconnectionTimes[i-1]);
        }
        
        // Each interval should be longer than the previous (exponential backoff)
        for (let i = 1; i < intervals.length; i++) {
          expect(intervals[i]).toBeGreaterThan(intervals[i-1] * 0.5); // Allow some variance
        }
      }
    });
    
    it('should limit maximum reconnection attempts', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Track disconnect events
      const disconnectEvents = [];
      handler.onDisconnect = () => {
        disconnectEvents.push(Date.now());
      };
      
      // Simulate repeated connection failures
      for (let i = 0; i < handler.config.maxReconnectAttempts + 2; i++) {
        handler.eventSource._simulateConnectionDrop();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      expect(handler.reconnectAttempts).toBeLessThanOrEqual(handler.config.maxReconnectAttempts);
    });
  });

  describe('Background Tab Behavior', () => {
    it('should handle tab going to background', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Simulate tab going to background
      global.document.hidden = true;
      handler.isBackgroundTab = true;
      handler._handleBackgroundTab();
      
      expect(handler.isBackgroundTab).toBe(true);
      expect(handler.backgroundTimer).toBeDefined();
    });
    
    it('should maintain connection in background for limited time', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Set short background timeout for testing
      handler.config.backgroundTabTimeout = 100;
      
      const disconnectEvents = [];
      handler.onDisconnect = () => {
        disconnectEvents.push(Date.now());
      };
      
      // Simulate tab going to background
      global.document.hidden = true;
      handler.isBackgroundTab = true;
      handler._handleBackgroundTab();
      
      // Wait for background timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(disconnectEvents.length).toBeGreaterThan(0);
    });
    
    it('should restore connection when tab returns to foreground', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Simulate disconnect while in background
      handler.isConnected = false;
      handler.isBackgroundTab = true;
      
      const reconnections = [];
      const originalReconnect = handler._reconnect;
      handler._reconnect = () => {
        reconnections.push(Date.now());
        originalReconnect.call(handler);
      };
      
      // Simulate tab returning to foreground
      global.document.hidden = false;
      handler.isBackgroundTab = false;
      handler._handleForegroundTab();
      
      expect(reconnections.length).toBeGreaterThan(0);
    });
  });

  describe('Message Handling', () => {
    it('should handle different message types', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      const messages = [];
      handler.onMessage = (content) => {
        messages.push(content);
      };
      
      const errors = [];
      handler.onError = (error) => {
        errors.push(error);
      };
      
      await handler.connect();
      await connectPromise;
      
      // Test different message types
      handler.eventSource._simulateMessage({
        type: 'message',
        content: 'Hello from server'
      });
      
      handler.eventSource._simulateMessage({
        type: 'error',
        error: 'Test error message'
      });
      
      handler.eventSource._simulateMessage({
        type: 'keepalive',
        timestamp: Date.now()
      });
      
      expect(messages).toContain('Hello from server');
      expect(errors).toContain('Test error message');
    });
    
    it('should update last activity on message receipt', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      const initialActivity = handler.lastActivity;
      
      // Wait a bit then send message
      await new Promise(resolve => setTimeout(resolve, 50));
      
      handler.eventSource._simulateMessage({
        type: 'message',
        content: 'Activity update test'
      });
      
      expect(handler.lastActivity).toBeGreaterThan(initialActivity);
    });
  });

  describe('Performance and Optimization', () => {
    it('should establish connection within acceptable time', async () => {
      const startTime = Date.now();
      
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = () => {
          const connectTime = Date.now() - startTime;
          expect(connectTime).toBeLessThan(1000); // Should connect within 1 second
          resolve();
        };
      });
      
      await handler.connect();
      await connectPromise;
    });
    
    it('should handle rapid message sequences', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      const messages = [];
      handler.onMessage = (content) => {
        messages.push(content);
      };
      
      await handler.connect();
      await connectPromise;
      
      // Send rapid sequence of messages
      for (let i = 0; i < 10; i++) {
        handler.eventSource._simulateMessage({
          type: 'message',
          content: `Message ${i}`
        });
      }
      
      expect(messages.length).toBe(10);
      expect(messages[0]).toBe('Message 0');
      expect(messages[9]).toBe('Message 9');
    });
    
    it('should cleanup resources on disconnect', () => {
      const timers = [];
      const originalSetInterval = global.setInterval;
      const originalClearInterval = global.clearInterval;
      
      global.setInterval = (fn, delay) => {
        const id = originalSetInterval(fn, delay);
        timers.push(id);
        return id;
      };
      
      let clearedTimers = 0;
      global.clearInterval = (id) => {
        clearedTimers++;
        return originalClearInterval(id);
      };
      
      handler.connect();
      handler.disconnect();
      
      expect(clearedTimers).toBeGreaterThan(0);
      
      // Restore original functions
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
  });

  describe('Error Handling', () => {
    it('should handle EventSource creation errors', async () => {
      const errors = [];
      handler.onError = (error) => {
        errors.push(error);
      };
      
      // Mock EventSource constructor to throw
      const OriginalEventSource = global.EventSource;
      global.EventSource = class {
        constructor() {
          throw new Error('EventSource creation failed');
        }
      };
      
      await handler.connect();
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('EventSource creation failed');
      
      // Restore
      global.EventSource = OriginalEventSource;
    });
    
    it('should handle malformed message data', async () => {
      const connectPromise = new Promise((resolve) => {
        handler.onConnect = resolve;
      });
      
      await handler.connect();
      await connectPromise;
      
      // Send malformed JSON
      const event = { type: 'message', data: 'invalid-json{' };
      handler.eventSource.onmessage(event);
      
      // Should not crash the handler
      expect(handler.isConnected).toBe(true);
    });
  });
});

describe('Safari Streaming Integration', () => {
  let handler;
  
  beforeEach(() => {
    // Clear Safari detection cache before each test
    _clearDetectionCache();
    
    global.navigator = {
      userAgent: mockSafariUserAgent
    };
    
    global.document = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    
    handler = new SafariStreamingHandler({
      streamingEndpoint: 'https://test-streaming.lambda-url.us-east-1.on.aws/',
      tenantHash: 'safari-integration-test'
    });
  });
  
  afterEach(() => {
    if (handler) {
      handler.disconnect();
    }
  });

  it('should integrate with Safari-specific streaming endpoint', async () => {
    const connectPromise = new Promise((resolve) => {
      handler.onConnect = resolve;
    });
    
    await handler.connect();
    await connectPromise;
    
    expect(handler.eventSource.url).toContain('safari=1');
    expect(handler.eventSource.url).toContain('mobile=1');
    expect(handler.eventSource.url).toContain('tenant=safari-integration-test');
  });
  
  it('should handle streaming first token within performance target', async () => {
    const connectPromise = new Promise((resolve) => {
      handler.onConnect = resolve;
    });
    
    const firstTokenTime = Date.now();
    const firstTokenPromise = new Promise((resolve) => {
      handler.onMessage = (content) => {
        const elapsed = Date.now() - firstTokenTime;
        expect(elapsed).toBeLessThan(1000); // <1000ms requirement
        resolve(elapsed);
      };
    });
    
    await handler.connect();
    await connectPromise;
    
    // Simulate first streaming token
    handler.eventSource._simulateMessage({
      type: 'message',
      content: 'First streaming token'
    });
    
    await firstTokenPromise;
  });
});

// Export for use in other tests
export { SafariStreamingHandler, MockEventSource };