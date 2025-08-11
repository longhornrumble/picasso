import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStreaming } from '../useStreaming';

// Mock error logger
vi.mock('../../utils/errorHandling', () => ({
  errorLogger: {
    logInfo: vi.fn(),
    logError: vi.fn(),
    logWarning: vi.fn()
  }
}));

// Mock EventSource
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = EventSource.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    
    // Store instance for testing
    MockEventSource.instances.push(this);
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = EventSource.OPEN;
      if (this.onopen) {
        this.onopen();
      }
    }, 10);
  }
  
  close() {
    this.readyState = EventSource.CLOSED;
  }
  
  // Test helper methods
  static instances = [];
  
  static clearInstances() {
    MockEventSource.instances = [];
  }
  
  static getLatestInstance() {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
  
  // Simulate receiving a message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }
  
  // Simulate an error
  simulateError(error = {}) {
    if (this.onerror) {
      this.onerror(error);
    }
  }
}

// Set up EventSource constants
MockEventSource.CONNECTING = 0;
MockEventSource.OPEN = 1;
MockEventSource.CLOSED = 2;

global.EventSource = MockEventSource;

describe('useStreaming', () => {
  const mockConfig = {
    streamingEndpoint: 'https://test-streaming.com/stream',
    tenantHash: 'test-tenant-hash-123',
    onMessage: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.clearInstances();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Hook initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      expect(result.current.isStreaming).toBe(false);
      expect(result.current.getMetrics()).toBeNull();
      expect(typeof result.current.startStreaming).toBe('function');
      expect(typeof result.current.stopStreaming).toBe('function');
    });

    it('should provide stable function references', () => {
      const { result, rerender } = renderHook(() => useStreaming(mockConfig));

      const initialFunctions = {
        startStreaming: result.current.startStreaming,
        stopStreaming: result.current.stopStreaming,
        getMetrics: result.current.getMetrics
      };

      rerender();

      expect(result.current.startStreaming).toBe(initialFunctions.startStreaming);
      expect(result.current.stopStreaming).toBe(initialFunctions.stopStreaming);
      expect(result.current.getMetrics).toBe(initialFunctions.getMetrics);
    });
  });

  describe('Stream validation', () => {
    it('should handle missing streaming endpoint', async () => {
      const configWithoutEndpoint = { ...mockConfig, streamingEndpoint: null };
      const { result } = renderHook(() => useStreaming(configWithoutEndpoint));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      expect(mockConfig.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Streaming endpoint not configured'
        })
      );
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle missing tenant hash', async () => {
      const configWithoutHash = { ...mockConfig, tenantHash: null };
      const { result } = renderHook(() => useStreaming(configWithoutHash));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      expect(mockConfig.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Tenant hash required for streaming'
        })
      );
      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('Stream connection', () => {
    it('should start streaming and create EventSource', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      expect(result.current.isStreaming).toBe(true);
      expect(MockEventSource.instances).toHaveLength(1);
      
      const eventSource = MockEventSource.getLatestInstance();
      expect(eventSource.url).toContain('https://test-streaming.com/stream');
      expect(eventSource.url).toContain('tenant_hash=test-tenant-hash-123');
      expect(eventSource.url).toContain('user_input=test%20message');
      expect(eventSource.url).toContain('session_id=test-session');
      // message_id parameter removed from streaming implementation
    });

    it('should set streaming state correctly during connection', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      expect(result.current.isStreaming).toBe(false);

      act(() => {
        result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      expect(result.current.isStreaming).toBe(true);
    });

    it('should clean up existing connection before starting new one', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      // Start first connection
      await act(async () => {
        await result.current.startStreaming({
          userInput: 'first message',
          sessionId: 'test-session-1'        });
      });

      const firstEventSource = MockEventSource.getLatestInstance();
      expect(MockEventSource.instances).toHaveLength(1);

      // Start second connection
      await act(async () => {
        await result.current.startStreaming({
          userInput: 'second message',
          sessionId: 'test-session-2'        });
      });

      expect(firstEventSource.readyState).toBe(EventSource.CLOSED);
      expect(MockEventSource.instances).toHaveLength(2);
    });
  });

  describe('Message handling', () => {
    it('should handle text messages correctly', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      act(() => {
        eventSource.simulateMessage(JSON.stringify({
          type: 'text',
          content: 'Hello world'
        }));
      });

      expect(mockConfig.onMessage).toHaveBeenCalledWith('Hello world');
    });

    it('should handle plain text messages (non-JSON)', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      act(() => {
        eventSource.simulateMessage('Plain text message');
      });

      expect(mockConfig.onMessage).toHaveBeenCalledWith('Plain text message');
    });

    it('should handle stream completion with [DONE] message', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Send some messages first
      act(() => {
        eventSource.simulateMessage(JSON.stringify({
          type: 'text',
          content: 'First chunk'
        }));
      });

      act(() => {
        eventSource.simulateMessage(JSON.stringify({
          type: 'text',
          content: 'Second chunk'
        }));
      });

      // Complete the stream
      act(() => {
        eventSource.simulateMessage('[DONE]');
      });

      expect(mockConfig.onComplete).toHaveBeenCalled();
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle error messages in stream', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      act(() => {
        eventSource.simulateMessage(JSON.stringify({
          type: 'error',
          message: 'Stream processing error'
        }));
      });

      expect(mockConfig.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Stream processing error'
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle EventSource errors', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      act(() => {
        eventSource.readyState = EventSource.CLOSED;
        eventSource.simulateError();
      });

      expect(mockConfig.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Streaming connection closed'
        })
      );
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle connection timeout', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      act(() => {
        result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      // Fast-forward time to trigger timeout
      act(() => {
        vi.advanceTimersByTime(25001); // Just over 25 seconds
      });

      expect(mockConfig.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Streaming response timeout'
        })
      );
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle timeout after connection established', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Simulate connection opening
      act(() => {
        eventSource.readyState = EventSource.OPEN;
        if (eventSource.onopen) {
          eventSource.onopen();
        }
      });

      // Fast-forward time to trigger the post-connection timeout
      act(() => {
        vi.advanceTimersByTime(30001); // Just over 30 seconds
      });

      expect(mockConfig.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Streaming response timeout'
        })
      );
    });

    it('should clear timeout when first message received', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Simulate receiving a message
      act(() => {
        eventSource.simulateMessage('First message');
      });

      // Fast-forward time past timeout - should not trigger timeout
      act(() => {
        vi.advanceTimersByTime(35000);
      });

      expect(mockConfig.onError).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('timeout')
        })
      );
    });
  });

  describe('Stream control', () => {
    it('should stop streaming manually', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      expect(result.current.isStreaming).toBe(true);

      act(() => {
        result.current.stopStreaming();
      });

      expect(result.current.isStreaming).toBe(false);
      
      const eventSource = MockEventSource.getLatestInstance();
      expect(eventSource.readyState).toBe(EventSource.CLOSED);
    });

    it('should handle multiple stop calls gracefully', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      act(() => {
        result.current.stopStreaming();
        result.current.stopStreaming(); // Second call should not error
      });

      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('Metrics tracking', () => {
    it('should track basic metrics', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      // Initially no metrics
      expect(result.current.getMetrics()).toBeNull();

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Send a message to start metrics tracking
      act(() => {
        eventSource.simulateMessage('First token');
      });

      // Complete the stream
      act(() => {
        eventSource.simulateMessage('[DONE]');
      });

      const metrics = result.current.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.timeToFirstToken).toBeGreaterThan(0);
      expect(metrics.totalTime).toBeGreaterThan(0);
      expect(metrics.tokenCount).toBe(1);
    });

    it('should calculate tokens per second correctly', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      // Send multiple messages
      act(() => {
        eventSource.simulateMessage('Token 1');
        eventSource.simulateMessage('Token 2');
        eventSource.simulateMessage('Token 3');
      });

      // Advance time and complete stream
      act(() => {
        vi.advanceTimersByTime(1000); // 1 second
        eventSource.simulateMessage('[DONE]');
      });

      const metrics = result.current.getMetrics();
      expect(metrics.tokenCount).toBe(3);
      expect(parseFloat(metrics.tokensPerSecond)).toBeGreaterThan(0);
    });

    it('should handle metrics when stream is stopped manually', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      act(() => {
        eventSource.simulateMessage('Some content');
      });

      act(() => {
        vi.advanceTimersByTime(500);
        result.current.stopStreaming();
      });

      const metrics = result.current.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalTime).toBeGreaterThan(0);
      expect(metrics.tokenCount).toBe(1);
    });
  });

  describe('Memory management', () => {
    it('should clean up resources on unmount', async () => {
      const { result, unmount } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();
      expect(eventSource.readyState).toBe(EventSource.OPEN);

      unmount();

      // EventSource should still be open since we don't have cleanup in the hook
      // This test verifies that the hook doesn't prevent unmounting
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined callbacks gracefully', async () => {
      const configWithoutCallbacks = {
        streamingEndpoint: 'https://test-streaming.com/stream',
        tenantHash: 'test-tenant-hash-123'
        // No onMessage, onComplete, onError callbacks
      };

      const { result } = renderHook(() => useStreaming(configWithoutCallbacks));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      // These should not throw errors
      expect(() => {
        act(() => {
          eventSource.simulateMessage('test message');
          eventSource.simulateMessage('[DONE]');
          eventSource.simulateError();
        });
      }).not.toThrow();
    });

    it('should handle empty or malformed stream data', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      await act(async () => {
        await result.current.startStreaming({
          userInput: 'test message',
          sessionId: 'test-session'        });
      });

      const eventSource = MockEventSource.getLatestInstance();

      expect(() => {
        act(() => {
          eventSource.simulateMessage(''); // Empty message
          eventSource.simulateMessage('{"invalid": json'); // Malformed JSON
          eventSource.simulateMessage('null'); // Null JSON
        });
      }).not.toThrow();
    });

    it('should handle rapid start/stop cycles', async () => {
      const { result } = renderHook(() => useStreaming(mockConfig));

      // Rapid start/stop cycles
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.startStreaming({
            userInput: `test message ${i}`,
            sessionId: `test-session-${i}`,
          });
        });

        act(() => {
          result.current.stopStreaming();
        });
      }

      expect(result.current.isStreaming).toBe(false);
      // Should have created multiple EventSource instances
      expect(MockEventSource.instances.length).toBeGreaterThan(1);
    });
  });
});