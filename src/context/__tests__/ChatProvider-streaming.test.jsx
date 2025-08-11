/**
 * Comprehensive ChatProvider Streaming Integration Tests
 * 
 * Tests the surgical integration of streaming capability while preserving HTTP fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { ChatProvider, getChatContext } from '../ChatProvider';
import React, { useContext, useEffect } from 'react';

// Mock modules
vi.mock('../../config/environment', () => ({
  config: {
    ENVIRONMENT: 'staging',
    isStaging: () => true,
    isDevelopment: () => false,
    isProduction: () => false,
    getStreamingUrl: vi.fn(() => 'https://staging-streaming.test/stream'),
    isStreamingEnabled: vi.fn(() => true),
    getDefaultTenantHash: () => 'test-tenant-123',
    log: vi.fn()
  }
}));

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({
    config: {
      tenant_hash: 'test-tenant-123',
      welcome_message: 'Welcome to streaming test',
      features: {
        streaming_enabled: true
      }
    }
  })
}));

vi.mock('../../utils/errorHandling', () => ({
  errorLogger: {
    logInfo: vi.fn(),
    logError: vi.fn(),
    logWarning: vi.fn()
  },
  performanceMonitor: {
    startTimer: vi.fn(),
    endTimer: vi.fn(),
    measure: vi.fn((name, fn) => fn())
  },
  classifyError: vi.fn(),
  shouldRetry: vi.fn(() => false),
  getBackoffDelay: vi.fn(() => 1000),
  getUserFriendlyMessage: vi.fn(() => 'Test error'),
  ERROR_TYPES: {
    NETWORK_ERROR: 'network_error'
  }
}));

// Mock streaming utilities
const mockStreamingHook = {
  isStreaming: false,
  startStreaming: vi.fn(),
  stopStreaming: vi.fn(),
  getMetrics: vi.fn(() => null)
};

const mockStreamingValidator = {
  quickStreamingHealthCheck: vi.fn(() => Promise.resolve(true)),
  validateStreamingEndpoint: vi.fn(() => Promise.resolve({ isValid: true }))
};

vi.mock('../../hooks/useStreaming', () => ({
  useStreaming: () => mockStreamingHook
}));

vi.mock('../../utils/streamingValidator', () => ({
  quickStreamingHealthCheck: mockStreamingValidator.quickStreamingHealthCheck
}));

// Mock fetch globally
global.fetch = vi.fn();

// Mock EventSource
global.EventSource = vi.fn();

describe('ChatProvider Streaming Integration', () => {
  let TestComponent;
  let chatContextValue;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset streaming mocks
    mockStreamingHook.isStreaming = false;
    mockStreamingHook.startStreaming.mockReset();
    mockStreamingHook.stopStreaming.mockReset();
    mockStreamingValidator.quickStreamingHealthCheck.mockResolvedValue(true);
    
    // Setup global.fetch mock for HTTP fallback
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: 'HTTP response content',
        session_id: 'test-session-123'
      }),
      text: () => Promise.resolve(JSON.stringify({
        content: 'HTTP response content',
        session_id: 'test-session-123'
      }))
    });

    // Test component to access context
    TestComponent = ({ onContextUpdate }) => {
      const context = useContext(getChatContext());
      
      useEffect(() => {
        if (onContextUpdate) {
          onContextUpdate(context);
        }
      }, [context, onContextUpdate]);
      
      return <div data-testid="test-component">Chat Test</div>;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Flag Control', () => {
    it('should respect streaming feature flags from tenant config', async () => {
      const { config } = await import('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(true);
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue).toBeDefined();
      });

      // Should eventually enable streaming
      await waitFor(() => {
        expect(contextValue.streamingAvailable).toBe(true);
      }, { timeout: 5000 });
      
      expect(contextValue.streamingEnabled).toBe(true);
      expect(mockStreamingValidator.quickStreamingHealthCheck).toHaveBeenCalled();
    });

    it('should disable streaming when feature flag is off', async () => {
      const { config } = await import('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(false);
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue).toBeDefined();
      });

      // Should remain false
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      expect(contextValue.streamingAvailable).toBe(false);
      expect(contextValue.streamingEnabled).toBe(false);
      expect(mockStreamingValidator.quickStreamingHealthCheck).not.toHaveBeenCalled();
    });
  });

  describe('Streaming with HTTP Fallback', () => {
    beforeEach(() => {
      const { config } = require('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(true);
    });

    it('should attempt streaming first when enabled', async () => {
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue?.streamingEnabled).toBe(true);
      });

      // Simulate sending a message
      await act(async () => {
        await contextValue.addMessage({
          role: 'user',
          content: 'Test streaming message'
        });
      });

      // Should have attempted streaming
      expect(mockStreamingHook.startStreaming).toHaveBeenCalledWith({
        userInput: 'Test streaming message',
        sessionId: expect.any(String)
      });
    });

    it('should fallback to HTTP when streaming fails', async () => {
      // Make streaming fail
      mockStreamingHook.startStreaming.mockRejectedValue(new Error('Streaming failed'));
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue?.streamingEnabled).toBe(true);
      });

      // Simulate sending a message
      await act(async () => {
        await contextValue.addMessage({
          role: 'user',
          content: 'Test fallback message'
        });
      });

      // Should have attempted streaming first
      expect(mockStreamingHook.startStreaming).toHaveBeenCalled();
      
      // Should fallback to HTTP
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Test fallback message')
          })
        );
      });
    });

    it('should use HTTP directly when streaming is disabled', async () => {
      const { config } = await import('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(false);
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue).toBeDefined();
      });

      // Simulate sending a message
      await act(async () => {
        await contextValue.addMessage({
          role: 'user',
          content: 'Test HTTP-only message'
        });
      });

      // Should NOT have attempted streaming
      expect(mockStreamingHook.startStreaming).not.toHaveBeenCalled();
      
      // Should use HTTP directly
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Test HTTP-only message')
          })
        );
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(() => {
      const { config } = require('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(true);
    });

    it('should handle streaming utility load failures gracefully', async () => {
      // Mock module import failure
      vi.doMock('../../hooks/useStreaming', () => {
        throw new Error('Module load failed');
      });
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue).toBeDefined();
      });

      // Should still work with HTTP
      await act(async () => {
        await contextValue.addMessage({
          role: 'user',
          content: 'Test with module failure'
        });
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle streaming endpoint health check failures', async () => {
      mockStreamingValidator.quickStreamingHealthCheck.mockResolvedValue(false);
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue).toBeDefined();
      });

      // Should remain disabled due to health check failure
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      expect(contextValue.streamingEnabled).toBe(false);
    });

    it('should maintain existing HTTP retry logic', async () => {
      const { shouldRetry } = await import('../../utils/errorHandling');
      shouldRetry.mockReturnValue(true);
      
      // Make fetch fail then succeed
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ content: 'Retry success' }),
          text: () => Promise.resolve(JSON.stringify({ content: 'Retry success' }))
        });
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue).toBeDefined();
      });

      // Disable streaming to test pure HTTP path
      const { config } = await import('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(false);

      await act(async () => {
        await contextValue.addMessage({
          role: 'user',
          content: 'Test retry logic'
        });
      });

      // Should have made multiple fetch calls due to retry
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Performance and Memory Management', () => {
    it('should lazy load streaming utilities only when needed', async () => {
      const { config } = await import('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(false);
      
      render(
        <ChatProvider>
          <TestComponent />
        </ChatProvider>
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Streaming utilities should not be loaded
      expect(mockStreamingValidator.quickStreamingHealthCheck).not.toHaveBeenCalled();
    });

    it('should preserve existing message persistence', async () => {
      const mockSessionStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
      };
      
      Object.defineProperty(window, 'sessionStorage', {
        value: mockSessionStorage,
        writable: true
      });

      mockSessionStorage.getItem.mockReturnValue(JSON.stringify([
        { id: '1', role: 'user', content: 'Persisted message' }
      ]));

      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue?.messages).toBeDefined();
      });

      expect(contextValue.messages).toHaveLength(1);
      expect(contextValue.messages[0].content).toBe('Persisted message');
    });
  });

  describe('Debug Information', () => {
    it('should include streaming status in debug info', async () => {
      const { config } = await import('../../config/environment');
      config.isStreamingEnabled.mockReturnValue(true);
      
      let contextValue;
      const handleContextUpdate = (ctx) => { contextValue = ctx; };

      render(
        <ChatProvider>
          <TestComponent onContextUpdate={handleContextUpdate} />
        </ChatProvider>
      );

      await waitFor(() => {
        expect(contextValue?.streamingEnabled).toBe(true);
      });

      expect(contextValue._debug.streamingStatus).toEqual({
        available: true,
        enabled: true,
        hookInitialized: false,
        currentMessage: null
      });

      expect(contextValue._debug.apiType).toBe('streaming-with-http-fallback');
    });
  });
});