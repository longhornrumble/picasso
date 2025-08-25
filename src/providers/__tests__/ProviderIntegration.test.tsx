/**
 * Provider Integration Tests
 * 
 * Tests the coordination and integration patterns between different provider functionalities:
 * - State and API provider coordination patterns
 * - Message flow integration patterns
 * - Error handling coordination
 * - Session consistency patterns
 * - Memory monitoring coordination
 * 
 * These tests validate integration patterns without requiring full React component setup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionId, createMessageId } from '../../types/branded';
import type { MessageInput } from '../../types/chat-context';
import type { ValidTenantHash } from '../../types/security';
import type { SessionId } from '../../types/branded';

// Mock integration test providers
class IntegrationTestStateProvider {
  private _messages: any[] = [];
  private _sessionId: SessionId;
  
  constructor(sessionId?: SessionId) {
    this._sessionId = sessionId || createSessionId(`test_session_${Date.now()}`);
  }
  
  get sessionId() { return this._sessionId; }
  get messageCount() { return this._messages.length; }
  get messages() { return [...this._messages]; }
  
  async addMessage(message: MessageInput) {
    const messageId = createMessageId();
    const chatMessage = {
      ...message,
      id: messageId.value,
      timestamp: Date.now()
    };
    this._messages.push(chatMessage);
    return messageId;
  }
  
  async removeMessage(messageId: string) {
    const index = this._messages.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      this._messages.splice(index, 1);
      return true;
    }
    return false;
  }
  
  clearMessages() {
    this._messages = [];
  }
  
  validateIntegrity() {
    const messageIds = new Set();
    const duplicates = [];
    
    for (const message of this._messages) {
      if (messageIds.has(message.id)) {
        duplicates.push(message.id);
      } else {
        messageIds.add(message.id);
      }
    }
    
    return {
      isValid: duplicates.length === 0,
      errors: duplicates.length > 0 ? [`Duplicate message IDs: ${duplicates.join(', ')}`] : [],
      messagesValidated: this._messages.length,
      duplicateMessages: duplicates
    };
  }
  
  getMemoryUsage() {
    const messageMemory = JSON.stringify(this._messages).length;
    return {
      messageMemory,
      sessionMemory: JSON.stringify({ sessionId: this._sessionId }).length,
      totalMemory: messageMemory + 1000 // Mock overhead
    };
  }
}

class IntegrationTestAPIProvider {
  private _requestLogs: any[] = [];
  private _networkQuality: string = 'good';
  private _cache: Map<string, any> = new Map();
  
  get requestLogs() { return [...this._requestLogs]; }
  get networkQuality() { return this._networkQuality; }
  
  setNetworkQuality(quality: string) {
    this._networkQuality = quality;
  }
  
  async sendMessage(message: string, sessionId: SessionId, tenantHash: ValidTenantHash) {
    // Simulate network delay based on quality
    const delays = { excellent: 50, good: 100, fair: 200, poor: 500, offline: 0 };
    const delay = delays[this._networkQuality as keyof typeof delays] || 100;
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    this._requestLogs.push({
      type: 'sendMessage',
      message,
      sessionId,
      tenantHash,
      timestamp: Date.now(),
      networkQuality: this._networkQuality
    });
    
    if (this._networkQuality === 'offline') {
      throw new Error('Network offline');
    }
    
    return {
      success: true,
      data: {
        response: `AI response to: ${message}`,
        message_id: `msg_${Date.now()}`,
        timestamp: Date.now()
      },
      request_id: `req_${Date.now()}`
    };
  }
  
  async getTenantConfig(tenantHash: ValidTenantHash) {
    const cacheKey = `config_${tenantHash}`;
    
    if (this._cache.has(cacheKey)) {
      return { success: true, data: this._cache.get(cacheKey), fromCache: true };
    }
    
    const config = {
      branding: { primaryColor: '#007bff' },
      features: { streaming: true, fileUpload: true },
      limits: { maxMessageLength: 4000 }
    };
    
    this._cache.set(cacheKey, config);
    
    this._requestLogs.push({
      type: 'getTenantConfig',
      tenantHash,
      timestamp: Date.now()
    });
    
    return { success: true, data: config, fromCache: false };
  }
  
  classifyError(error: Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('offline')) {
      return {
        type: 'network_error',
        retryable: true,
        userFriendlyMessage: 'Network connection issue. Please try again.'
      };
    }
    
    return {
      type: 'unknown_error',
      retryable: false,
      userFriendlyMessage: 'An unexpected error occurred.'
    };
  }
  
  getMetrics() {
    return {
      totalRequests: this._requestLogs.length,
      networkQuality: this._networkQuality,
      cacheSize: this._cache.size
    };
  }
}

describe('Provider Integration - State-API Coordination', () => {
  let stateProvider: IntegrationTestStateProvider;
  let apiProvider: IntegrationTestAPIProvider;
  const testTenantHash = 'integration-test-tenant' as ValidTenantHash;
  const testSessionId = createSessionId('integration-test-session');
  
  beforeEach(() => {
    vi.clearAllMocks();
    stateProvider = new IntegrationTestStateProvider(testSessionId);
    apiProvider = new IntegrationTestAPIProvider();
  });

  it('should coordinate message state updates with API responses', async () => {
    // Add user message to state
    const userMessage: MessageInput = {
      content: 'Hello, test integration',
      sender: 'user',
      type: 'text'
    };
    
    const userMessageId = await stateProvider.addMessage(userMessage);
    expect(stateProvider.messageCount).toBe(1);
    
    // Make API call
    const apiResponse = await apiProvider.sendMessage(
      userMessage.content,
      testSessionId,
      testTenantHash
    );
    
    expect(apiResponse.success).toBe(true);
    expect(apiResponse.data.response).toContain('test integration');
    
    // Add AI response to state
    const aiMessage: MessageInput = {
      content: apiResponse.data.response,
      sender: 'assistant',
      type: 'text'
    };
    
    await stateProvider.addMessage(aiMessage);
    
    // Verify coordination
    expect(stateProvider.messageCount).toBe(2);
    const messages = stateProvider.messages;
    expect(messages[0].sender).toBe('user');
    expect(messages[1].sender).toBe('assistant');
    expect(messages[1].content).toContain('test integration');
  });

  it('should handle API errors gracefully with state rollback', async () => {
    // Set initial state
    const initialMessage: MessageInput = {
      content: 'Initial message',
      sender: 'user',
      type: 'text'
    };
    
    await stateProvider.addMessage(initialMessage);
    const initialMessageCount = stateProvider.messageCount;
    
    // Add optimistic message
    const optimisticMessage: MessageInput = {
      content: 'This will fail',
      sender: 'user',
      type: 'text'
    };
    
    const messageId = await stateProvider.addMessage(optimisticMessage);
    expect(stateProvider.messageCount).toBe(initialMessageCount + 1);
    
    // Simulate API failure
    apiProvider.setNetworkQuality('offline');
    
    let apiError: Error | null = null;
    try {
      await apiProvider.sendMessage(
        optimisticMessage.content,
        testSessionId,
        testTenantHash
      );
    } catch (error) {
      apiError = error as Error;
    }
    
    expect(apiError).toBeDefined();
    
    // Rollback state on API failure
    await stateProvider.removeMessage(messageId.value);
    expect(stateProvider.messageCount).toBe(initialMessageCount);
    
    // Verify state integrity
    const integrity = stateProvider.validateIntegrity();
    expect(integrity.isValid).toBe(true);
  });

  it('should maintain session consistency during API retries', async () => {
    const testMessage: MessageInput = {
      content: 'Test message with retries',
      sender: 'user',
      type: 'text'
    };
    
    await stateProvider.addMessage(testMessage);
    
    // Simulate network quality changes during retry
    apiProvider.setNetworkQuality('poor');
    
    const apiResponse = await apiProvider.sendMessage(
      testMessage.content,
      testSessionId,
      testTenantHash
    );
    
    expect(apiResponse).toBeDefined();
    expect(stateProvider.sessionId).toBe(testSessionId);
    
    // Verify session consistency
    expect(stateProvider.sessionId).toBe(testSessionId);
    expect(stateProvider.messageCount).toBe(1);
  });

  it('should synchronize memory monitoring across providers', async () => {
    // Get initial memory usage
    const initialStateMemory = stateProvider.getMemoryUsage();
    const initialApiMetrics = apiProvider.getMetrics();
    
    expect(initialStateMemory).toBeDefined();
    expect(initialApiMetrics).toBeDefined();
    
    // Simulate memory-intensive operations
    const messages: MessageInput[] = Array.from({ length: 20 }, (_, i) => ({
      content: `Memory test message ${i + 1} - ${'x'.repeat(50)}`,
      sender: i % 2 === 0 ? 'user' : 'assistant',
      type: 'text'
    }));
    
    // Add messages and make API calls
    for (const message of messages) {
      await stateProvider.addMessage(message);
      
      if (message.sender === 'user') {
        try {
          await apiProvider.sendMessage(message.content, testSessionId, testTenantHash);
        } catch (error) {
          // Ignore errors for memory testing
        }
      }
    }
    
    // Get updated memory usage
    const updatedStateMemory = stateProvider.getMemoryUsage();
    const updatedApiMetrics = apiProvider.getMetrics();
    
    // Verify memory usage increased
    expect(updatedStateMemory.messageMemory).toBeGreaterThan(initialStateMemory.messageMemory);
    expect(updatedApiMetrics.totalRequests).toBeGreaterThan(initialApiMetrics.totalRequests);
  });

  it('should handle concurrent provider operations safely', async () => {
    // Create concurrent operations
    const concurrentOperations = [
      // State operations
      stateProvider.addMessage({
        content: 'Concurrent message 1',
        sender: 'user',
        type: 'text'
      }),
      stateProvider.addMessage({
        content: 'Concurrent message 2',
        sender: 'user', 
        type: 'text'
      }),
      
      // API operations
      apiProvider.sendMessage('Concurrent API call 1', testSessionId, testTenantHash),
      apiProvider.getTenantConfig(testTenantHash),
      
      // Memory operations
      Promise.resolve(stateProvider.getMemoryUsage()),
      Promise.resolve(apiProvider.getMetrics())
    ];
    
    // Execute all operations concurrently
    const results = await Promise.allSettled(concurrentOperations);
    
    // Verify most operations succeeded
    const successCount = results.filter(result => result.status === 'fulfilled').length;
    expect(successCount).toBeGreaterThan(4); // Allow some failures
    
    // Verify data consistency after concurrent operations
    const stateIntegrity = stateProvider.validateIntegrity();
    expect(stateIntegrity.isValid).toBe(true);
    
    // Verify state consistency
    expect(stateProvider.sessionId).toBe(testSessionId);
    expect(stateProvider.messageCount).toBeGreaterThan(0);
  });

  it('should coordinate caching between providers', async () => {
    // Get tenant config - should cache
    const config1 = await apiProvider.getTenantConfig(testTenantHash);
    expect(config1.success).toBe(true);
    expect(config1.fromCache).toBe(false);
    
    // Second request should use cache
    const config2 = await apiProvider.getTenantConfig(testTenantHash);
    expect(config2.success).toBe(true);
    expect(config2.fromCache).toBe(true);
    
    // Verify cache coordination
    const metrics = apiProvider.getMetrics();
    expect(metrics.cacheSize).toBe(1);
  });

  it('should maintain performance under integrated load', async () => {
    const startTime = performance.now();
    
    // Simulate high-load scenario
    const loadTestOperations = [];
    
    // Add 50 messages with API calls
    for (let i = 0; i < 50; i++) {
      const message: MessageInput = {
        content: `Load test message ${i + 1}`,
        sender: i % 2 === 0 ? 'user' : 'assistant',
        type: 'text'
      };
      
      loadTestOperations.push(stateProvider.addMessage(message));
      
      // Make API calls for every 10th message
      if (i % 10 === 0) {
        loadTestOperations.push(
          apiProvider.sendMessage(message.content, testSessionId, testTenantHash)
        );
      }
    }
    
    // Execute all operations
    const results = await Promise.allSettled(loadTestOperations);
    const endTime = performance.now();
    
    // Verify performance
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    
    // Verify success rate
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const successRate = successCount / results.length;
    expect(successRate).toBeGreaterThan(0.8); // 80% success rate minimum
    
    // Verify final state
    expect(stateProvider.messageCount).toBe(50);
    
    // Verify session integrity
    const integrity = stateProvider.validateIntegrity();
    expect(integrity.isValid).toBe(true);
  });

  it('should handle provider initialization race conditions', async () => {
    // Create providers with potential race conditions
    const provider1 = new IntegrationTestStateProvider(testSessionId);
    const provider2 = new IntegrationTestAPIProvider();
    
    // Simulate immediate operations after initialization
    const operations = [
      provider1.addMessage({ content: 'Test 1', sender: 'user', type: 'text' }),
      provider2.getTenantConfig(testTenantHash),
      provider1.addMessage({ content: 'Test 2', sender: 'assistant', type: 'text' }),
      provider2.sendMessage('Test message', testSessionId, testTenantHash)
    ];
    
    const results = await Promise.allSettled(operations);
    
    // Most operations should succeed despite race conditions
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    expect(successCount).toBeGreaterThan(2);
    
    // Verify providers are functional
    expect(provider1.messageCount).toBeGreaterThan(0);
    expect(provider2.getMetrics().totalRequests).toBeGreaterThan(0);
  });

  it('should validate error classification consistency', () => {
    const errors = [
      new Error('Network offline'),
      new Error('Failed to fetch'),
      new Error('Request timeout'),
      new Error('Unknown error')
    ];
    
    for (const error of errors) {
      const classification = apiProvider.classifyError(error);
      
      expect(classification).toMatchObject({
        type: expect.any(String),
        retryable: expect.any(Boolean),
        userFriendlyMessage: expect.any(String)
      });
      
      // Verify user-friendly messages are meaningful
      expect(classification.userFriendlyMessage.length).toBeGreaterThan(10);
      expect(classification.userFriendlyMessage).not.toContain('undefined');
    }
  });
});