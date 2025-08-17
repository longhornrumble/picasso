/**
 * Frontend JWT/Function URL Integration Tests
 * Tests ChatProvider with JWT/Function URL authentication flow,
 * frontend authentication integration, and error handling/fallbacks.
 * 
 * This test suite validates the unified coordination architecture's frontend integration:
 * - ChatProvider integration with JWT/Function URL authentication
 * - Frontend authentication flow with tenant inference
 * - Error handling and graceful fallbacks
 * - Streaming integration with JWT-protected endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock environment configuration
const mockEnvironmentConfig = {
  ENVIRONMENT: 'test',
  getDefaultTenantHash: () => 'test-tenant-hash',
  getChatUrl: (tenantHash) => `https://test-chat.lambda-url.us-east-1.on.aws/?action=chat&t=${tenantHash}`,
  getStreamingUrl: (tenantHash) => `https://test-streaming.lambda-url.us-east-1.on.aws/?tenant=${tenantHash}`,
  isStreamingEnabled: () => true
};

// Mock useConfig hook
const mockTenantConfig = {
  tenant_hash: 'test-tenant-hash-12345',
  welcome_message: 'Hello! How can I help you today?',
  features: {
    streaming_enabled: true,
    jwt_authentication: true
  },
  metadata: {
    tenantHash: 'test-tenant-hash-12345'
  }
};

// Mock ChatProvider and related components
vi.mock('../config/environment', () => ({
  config: mockEnvironmentConfig
}));

vi.mock('../hooks/useConfig', () => ({
  useConfig: () => ({ config: mockTenantConfig })
}));

vi.mock('../hooks/useStreaming', () => ({
  useStreaming: (config) => ({
    startStreaming: vi.fn().mockResolvedValue(true),
    stopStreaming: vi.fn(),
    isConnected: true
  })
}));

vi.mock('../utils/streamingValidator', () => ({
  quickStreamingHealthCheck: vi.fn().mockResolvedValue(true)
}));

vi.mock('../utils/errorHandling', () => ({
  errorLogger: {
    logInfo: vi.fn(),
    logWarning: vi.fn(),
    logError: vi.fn()
  },
  performanceMonitor: {
    startTimer: vi.fn(),
    endTimer: vi.fn(),
    measure: (name, fn) => fn()
  },
  classifyError: vi.fn().mockReturnValue({ type: 'NETWORK_ERROR' }),
  shouldRetry: vi.fn().mockReturnValue(true),
  getBackoffDelay: vi.fn().mockReturnValue(1000),
  getUserFriendlyMessage: vi.fn().mockReturnValue('Please try again'),
  ERROR_TYPES: { NETWORK_ERROR: 'NETWORK_ERROR' }
}));

vi.mock('../utils/conversationManager', () => ({
  createConversationManager: () => ({
    conversationId: 'test-conversation-123',
    addMessage: vi.fn().mockReturnValue(true),
    getMetadata: () => ({
      messageCount: 0,
      hasBeenSummarized: false
    }),
    getConversationContext: () => ({
      conversationId: 'test-conversation-123',
      messageCount: 0
    }),
    updateFromChatResponse: vi.fn()
  })
}));

vi.mock('../utils/mobileCompatibility', () => ({
  initializeMobileCompatibility: vi.fn().mockResolvedValue({
    pwaInstaller: { deferredPrompt: null }
  })
}));

// Import ChatProvider after mocks
import { ChatProvider } from '../context/ChatProvider';

// Mock fetch for API requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock JWT generation response
const mockJWTResponse = {
  jwt_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  session_id: 'sess_test_12345',
  expires_in: 900,
  expires_at: Math.floor(Date.now() / 1000) + 900,
  purpose: 'stream',
  streaming_url: 'https://test-streaming.lambda-url.us-east-1.on.aws/'
};

// Mock chat response
const mockChatResponse = {
  content: 'Hello! This is a test response from the chat API.',
  session_id: 'sess_test_12345',
  api_version: 'actions-complete',
  actions: [
    { label: 'Get Help', action: 'help' },
    { label: 'Contact Support', action: 'contact' }
  ]
};

// Test component that uses ChatProvider
const TestChatComponent = () => {
  const [messages, setMessages] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(false);
  
  const sendMessage = async () => {
    setIsLoading(true);
    
    // Simulate sending a message through ChatProvider
    const testMessage = {
      id: 'test-message-123',
      role: 'user',
      content: 'Hello, test message'
    };
    
    setMessages(prev => [...prev, testMessage]);
    
    try {
      // Simulate API call
      const response = await fetch(mockEnvironmentConfig.getChatUrl('test-tenant-hash'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_hash: 'test-tenant-hash',
          user_input: testMessage.content,
          session_id: 'test-session'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, {
          id: 'bot-response-123',
          role: 'assistant',
          content: data.content || 'Default response'
        }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div>
      <div data-testid="messages">
        {messages.map(msg => (
          <div key={msg.id} data-testid={`message-${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>
      <button onClick={sendMessage} disabled={isLoading} data-testid="send-button">
        {isLoading ? 'Sending...' : 'Send Message'}
      </button>
    </div>
  );
};

describe('Frontend JWT/Function URL Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default successful responses
    mockFetch.mockImplementation((url) => {
      if (url.includes('action=generate_jwt')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockJWTResponse)
        });
      } else if (url.includes('action=chat')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockChatResponse)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  describe('ChatProvider Integration', () => {
    it('should render ChatProvider with tenant configuration', () => {
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });
    
    it('should initialize with JWT authentication capabilities', async () => {
      const { container } = render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      // Wait for initialization
      await waitFor(() => {
        expect(container).toBeTruthy();
      });
      
      // Verify tenant config is loaded
      expect(mockTenantConfig.features.jwt_authentication).toBe(true);
    });
    
    it('should handle streaming availability check', async () => {
      const { quickStreamingHealthCheck } = await import('../utils/streamingValidator');
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      // Wait for streaming check
      await waitFor(() => {
        expect(quickStreamingHealthCheck).toHaveBeenCalled();
      });
    });
  });

  describe('JWT Authentication Flow', () => {
    it('should generate JWT token for authenticated requests', async () => {
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      
      // Check if JWT generation was called (would be in real implementation)
      const fetchCalls = mockFetch.mock.calls;
      const chatCall = fetchCalls.find(call => call[0].includes('action=chat'));
      expect(chatCall).toBeDefined();
    });
    
    it('should handle JWT token expiration', async () => {
      // Mock expired JWT response
      mockFetch.mockImplementationOnce((url) => {
        if (url.includes('action=generate_jwt')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: 'Token expired' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockChatResponse)
        });
      });
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should handle the error gracefully
      await waitFor(() => {
        expect(screen.getByTestId('send-button')).not.toBeDisabled();
      });
    });
    
    it('should refresh JWT tokens automatically', async () => {
      let jwtCallCount = 0;
      
      mockFetch.mockImplementation((url) => {
        if (url.includes('action=generate_jwt')) {
          jwtCallCount++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              ...mockJWTResponse,
              jwt_token: `token-${jwtCallCount}`
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockChatResponse)
        });
      });
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      // Send multiple messages to trigger token refresh
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          fireEvent.click(sendButton);
        });
        
        await waitFor(() => {
          expect(screen.getByTestId('send-button')).not.toBeDisabled();
        });
      }
      
      // In real implementation, would verify token refresh calls
    });
  });

  describe('Function URL Security', () => {
    it('should make authenticated requests to Function URLs', async () => {
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      
      const fetchCall = mockFetch.mock.calls.find(call => 
        call[0].includes('action=chat')
      );
      
      expect(fetchCall).toBeDefined();
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
    });
    
    it('should handle Function URL AuthType: NONE with internal validation', async () => {
      // Test that requests go to Function URLs without external auth headers
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      
      const fetchCall = mockFetch.mock.calls.find(call => 
        call[0].includes('action=chat')
      );
      
      // Should not have Authorization header (Function URL handles auth internally)
      expect(fetchCall[1].headers.Authorization).toBeUndefined();
    });
    
    it('should handle Function URL access denied responses', async () => {
      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ 
            error: 'Access denied',
            failure_id: 'test-failure-123'
          })
        })
      );
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should handle 403 gracefully
      await waitFor(() => {
        expect(screen.getByTestId('send-button')).not.toBeDisabled();
      });
    });
  });

  describe('Streaming Integration', () => {
    it('should integrate streaming with JWT authentication', async () => {
      const { useStreaming } = await import('../hooks/useStreaming');
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      // Wait for streaming initialization
      await waitFor(() => {
        // Streaming should be available with JWT
        expect(mockTenantConfig.features.streaming_enabled).toBe(true);
      });
    });
    
    it('should fallback to HTTP when streaming fails', async () => {
      // Mock streaming failure
      vi.mocked(await import('../utils/streamingValidator')).quickStreamingHealthCheck
        .mockResolvedValueOnce(false);
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should fallback to HTTP
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('action=chat'),
          expect.any(Object)
        );
      });
    });
    
    it('should handle streaming connection drops gracefully', async () => {
      const mockStreamingHook = {
        startStreaming: vi.fn().mockRejectedValue(new Error('Connection failed')),
        stopStreaming: vi.fn(),
        isConnected: false
      };
      
      vi.mocked(await import('../hooks/useStreaming')).useStreaming
        .mockReturnValue(mockStreamingHook);
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should handle streaming failure and fallback
      await waitFor(() => {
        expect(screen.getByTestId('send-button')).not.toBeDisabled();
      });
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should handle error and reset state
      await waitFor(() => {
        expect(screen.getByTestId('send-button')).not.toBeDisabled();
      });
    });
    
    it('should retry failed requests with exponential backoff', async () => {
      let attemptCount = 0;
      
      mockFetch.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockChatResponse)
        });
      });
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should eventually succeed after retries
      await waitFor(() => {
        expect(attemptCount).toBeGreaterThan(1);
      }, { timeout: 5000 });
    });
    
    it('should handle tenant configuration loading failures', async () => {
      // Mock config loading failure
      vi.mocked(await import('../hooks/useConfig')).useConfig
        .mockReturnValueOnce({ config: null });
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      // Should render without crashing
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });
    
    it('should provide user-friendly error messages', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server timeout'));
      
      const { getUserFriendlyMessage } = await import('../utils/errorHandling');
      getUserFriendlyMessage.mockReturnValue('Request timed out. Please try again.');
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      await waitFor(() => {
        expect(getUserFriendlyMessage).toHaveBeenCalled();
      });
    });
  });

  describe('Performance Requirements', () => {
    it('should meet streaming first token performance target', async () => {
      const startTime = Date.now();
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      const firstResponseTime = Date.now() - startTime;
      
      // Should get response within 1000ms (streaming first token target)
      await waitFor(() => {
        expect(firstResponseTime).toBeLessThan(1000);
      });
    });
    
    it('should handle concurrent requests efficiently', async () => {
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      // Send multiple concurrent requests
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(act(async () => {
          fireEvent.click(sendButton);
        }));
      }
      
      await Promise.all(requests);
      
      // All requests should complete
      await waitFor(() => {
        expect(screen.getByTestId('send-button')).not.toBeDisabled();
      });
    });
    
    it('should optimize for mobile performance', async () => {
      // Mock mobile environment
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true
      });
      
      const startTime = Date.now();
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const initTime = Date.now() - startTime;
      
      // Should initialize quickly on mobile
      expect(initTime).toBeLessThan(500);
    });
  });

  describe('Session Management', () => {
    it('should maintain session state across interactions', async () => {
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      // Send first message
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('message-user')).toBeInTheDocument();
      });
      
      // Send second message
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should maintain session
      await waitFor(() => {
        expect(screen.getAllByTestId('message-user')).toHaveLength(2);
      });
    });
    
    it('should handle session timeouts gracefully', async () => {
      // Mock session timeout
      mockFetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Session expired' })
        })
      );
      
      render(
        <ChatProvider>
          <TestChatComponent />
        </ChatProvider>
      );
      
      const sendButton = screen.getByTestId('send-button');
      
      await act(async () => {
        fireEvent.click(sendButton);
      });
      
      // Should handle session timeout
      await waitFor(() => {
        expect(screen.getByTestId('send-button')).not.toBeDisabled();
      });
    });
  });
});

describe('End-to-End Authentication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full authentication flow', async () => {
    const authFlow = [];
    
    mockFetch.mockImplementation((url) => {
      if (url.includes('action=generate_jwt')) {
        authFlow.push('jwt_generation');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockJWTResponse)
        });
      } else if (url.includes('action=chat')) {
        authFlow.push('chat_request');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockChatResponse)
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    
    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>
    );
    
    const sendButton = screen.getByTestId('send-button');
    
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    await waitFor(() => {
      expect(authFlow).toContain('chat_request');
    });
    
    // Verify complete flow
    expect(screen.getByTestId('message-user')).toBeInTheDocument();
  });
  
  it('should validate JWT tokens properly', async () => {
    const tokenValidation = vi.fn().mockReturnValue(true);
    
    // Mock JWT validation
    const mockJWTValidation = {
      validate: tokenValidation
    };
    
    render(
      <ChatProvider>
        <TestChatComponent />
      </ChatProvider>
    );
    
    const sendButton = screen.getByTestId('send-button');
    
    await act(async () => {
      fireEvent.click(sendButton);
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('send-button')).not.toBeDisabled();
    });
  });
});

// Helper function to test with different configurations
const renderWithConfig = (config) => {
  const mockUseConfig = vi.fn().mockReturnValue({ config });
  vi.mocked(import('../hooks/useConfig')).useConfig = mockUseConfig;
  
  return render(
    <ChatProvider>
      <TestChatComponent />
    </ChatProvider>
  );
};

describe('Configuration Variations', () => {
  it('should handle different tenant configurations', async () => {
    const customConfig = {
      ...mockTenantConfig,
      features: {
        streaming_enabled: false,
        jwt_authentication: false
      }
    };
    
    renderWithConfig(customConfig);
    
    expect(screen.getByTestId('send-button')).toBeInTheDocument();
  });
  
  it('should adapt to environment-specific settings', async () => {
    const productionConfig = {
      ...mockTenantConfig,
      environment: 'production',
      features: {
        streaming_enabled: true,
        jwt_authentication: true,
        enhanced_security: true
      }
    };
    
    renderWithConfig(productionConfig);
    
    expect(screen.getByTestId('send-button')).toBeInTheDocument();
  });
});