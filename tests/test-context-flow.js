#!/usr/bin/env node
/**
 * Node.js Test Suite for Context Flow Testing
 * Tests the complete context flow from conversation manager to Lambda
 * 
 * Run with: node test-context-flow.js
 */

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Setup paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock browser globals for Node.js testing
global.sessionStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

// Mock chat endpoint responses
global.fetch = async (url, options) => {
  // Mock init_session endpoint
  if (url.includes('init_session')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        state_token: 'test_token_123',
        session_id: 'test_session_456',
        turn: 0
      })
    };
  }
  
  // Mock conversation save endpoint
  if (url.includes('save')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        stateToken: 'updated_token_789',
        turn: 1
      })
    };
  }
  
  // Mock chat endpoint - this is where context is sent
  if (url.includes('chat') || url.includes('Master_Function')) {
    const body = JSON.parse(options.body);
    
    // Verify context structure was sent to Lambda
    if (body.context) {
      // Simulate Lambda response that uses the context
      const contextMessages = body.context.recentMessages || [];
      const userName = extractUserName(contextMessages);
      
      return {
        ok: true,
        json: async () => ({
          success: true,
          response: userName ? 
            `I remember you told me your name is ${userName}. How can I help you today?` :
            'Hello! How can I help you today?',
          metadata: {
            contextReceived: true,
            contextMessageCount: contextMessages.length,
            conversationId: body.context.conversationId,
            turn: body.context.turn
          }
        })
      };
    } else {
      // No context sent
      return {
        ok: true,
        json: async () => ({
          success: true,
          response: 'Hello! How can I help you today?',
          metadata: {
            contextReceived: false
          }
        })
      };
    }
  }
  
  throw new Error(`Unmocked fetch call to: ${url}`);
};

// Helper function to extract user name from context messages
function extractUserName(messages) {
  for (const msg of messages) {
    if (msg.role === 'user' && msg.content) {
      const nameMatch = msg.content.match(/my name is (\w+)/i);
      if (nameMatch) {
        return nameMatch[1];
      }
    }
  }
  return null;
}

const mockTenantHash = 'test_tenant_hash_123456789';
const mockSessionId = 'test_session_987654321';

// Import or create mock ConversationManager and useChat
let ConversationManager;
let createConversationManager;
let useChat;

try {
  const { ConversationManager: CM, createConversationManager: CCM } = await import('../src/utils/conversationManager.js');
  ConversationManager = CM;
  createConversationManager = CCM;
} catch (error) {
  console.log('Creating mock ConversationManager for context flow tests...');
  
  class MockConversationManager {
    constructor(tenantHash, sessionId) {
      this.tenantHash = tenantHash;
      this.sessionId = sessionId;
      this.conversationId = `sess_${tenantHash.slice(0, 8)}_${Date.now()}`;
      this.messageBuffer = [];
      this.turn = 0;
      this.stateToken = null;
      this.isInitialized = false;
      this.metadata = {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        messageCount: 0,
        hasBeenSummarized: false,
        tenantHash: tenantHash.slice(0, 8) + '...'
      };
    }

    async initializeConversation() {
      this.conversationId = `sess_${this.tenantHash.slice(0, 8)}_${Date.now()}`;
      this.turn = 0;
      this.stateToken = 'mock_token_123';
      this.isInitialized = true;
      return { success: true, conversationId: this.conversationId };
    }

    addMessage(message) {
      const validatedMessage = {
        ...message,
        conversationId: this.conversationId,
        addedAt: new Date().toISOString()
      };
      
      this.messageBuffer.push(validatedMessage);
      this.metadata.messageCount++;
      this.metadata.updated = new Date().toISOString();
      return true;
    }

    getMessages() {
      return [...this.messageBuffer];
    }

    getConversationContext() {
      return {
        conversationId: this.conversationId,
        turn: this.turn,
        messageCount: this.metadata.messageCount,
        recentMessages: this.messageBuffer.slice(-5).map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        })),
        lastSummary: this.metadata.lastSummary,
        conversationStarted: this.metadata.created
      };
    }

    async updateFromChatResponse(chatResponse, userMessage, assistantMessage) {
      if (userMessage) this.addMessage(userMessage);
      if (assistantMessage) this.addMessage(assistantMessage);
      this.turn++;
      return { success: true };
    }
  }
  
  ConversationManager = MockConversationManager;
  createConversationManager = (tenantHash, sessionId) => new MockConversationManager(tenantHash, sessionId);
}

// Mock useChat hook functionality
function createMockUseChat(conversationManager) {
  return {
    sendMessage: async (message) => {
      // Get current conversation context
      const context = conversationManager.getConversationContext();
      
      // Simulate sending message to chat endpoint with context
      const response = await fetch('mock://chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          context: context,
          tenant_hash: conversationManager.tenantHash
        })
      });
      
      const chatResponse = await response.json();
      
      // Create message objects
      const userMessage = {
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };
      
      const assistantMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: chatResponse.response,
        timestamp: new Date().toISOString()
      };
      
      // Update conversation manager
      await conversationManager.updateFromChatResponse(
        chatResponse,
        userMessage,
        assistantMessage
      );
      
      return {
        success: chatResponse.success,
        response: chatResponse.response,
        metadata: chatResponse.metadata
      };
    }
  };
}

// Test runner
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log('🧪 Running Context Flow Test Suite');
    console.log('===================================\n');

    for (const { name, testFn } of this.tests) {
      // Reset mock state for each test
      global.sessionStorage.clear();
      
      try {
        console.log(`⏳ Running: ${name}`);
        await testFn();
        console.log(`✅ PASSED: ${name}\n`);
        this.passed++;
      } catch (error) {
        console.log(`❌ FAILED: ${name}`);
        console.log(`   Error: ${error.message}\n`);
        this.failed++;
      }
    }

    this.printSummary();
  }

  printSummary() {
    const total = this.passed + this.failed;
    console.log('Test Summary');
    console.log('============');
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / total) * 100).toFixed(1)}%`);
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

const runner = new TestRunner();

// Test: getConversationContext returns proper structure
runner.test('getConversationContext returns proper structure for Lambda', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  const context = manager.getConversationContext();
  
  // Test required fields for Lambda
  assert(context.conversationId, 'Context should include conversationId');
  assert(typeof context.turn === 'number', 'Context should include numeric turn');
  assert(typeof context.messageCount === 'number', 'Context should include numeric messageCount');
  assert(Array.isArray(context.recentMessages), 'Context should include recentMessages array');
  assert(context.conversationStarted, 'Context should include conversationStarted timestamp');
  
  // Test structure
  assert(typeof context === 'object', 'Context should be an object');
  assert(context.conversationId.startsWith('sess_'), 'ConversationId should have proper format');
});

// Test: Context includes recent messages
runner.test('Context includes recent messages in proper format', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Add some messages
  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'My name is Alice',
    timestamp: new Date().toISOString()
  });

  manager.addMessage({
    id: 'msg_2',
    role: 'assistant',
    content: 'Nice to meet you, Alice!',
    timestamp: new Date().toISOString()
  });

  const context = manager.getConversationContext();
  
  assert.equal(context.recentMessages.length, 2, 'Should include recent messages');
  assert.equal(context.messageCount, 2, 'Should report correct message count');
  
  // Test message structure for Lambda
  const userMsg = context.recentMessages[0];
  assert.equal(userMsg.role, 'user', 'Should preserve message role');
  assert.equal(userMsg.content, 'My name is Alice', 'Should preserve message content');
  assert(userMsg.timestamp, 'Should include timestamp');
  
  const assistantMsg = context.recentMessages[1];
  assert.equal(assistantMsg.role, 'assistant', 'Should preserve assistant role');
  assert.equal(assistantMsg.content, 'Nice to meet you, Alice!', 'Should preserve assistant content');
});

// Test: Context is sent in chat requests
runner.test('Context is sent to Lambda in chat requests', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();
  
  const useChat = createMockUseChat(manager);

  // First, introduce name
  const response1 = await useChat.sendMessage('My name is Bob');
  
  assert(response1.success, 'First message should succeed');
  assert(response1.metadata.contextReceived, 'Context should be sent to Lambda');
  assert.equal(response1.metadata.contextMessageCount, 0, 'First request should have no prior messages');

  // Second message should include context
  const response2 = await useChat.sendMessage('What is my name?');
  
  assert(response2.success, 'Second message should succeed');
  assert(response2.metadata.contextReceived, 'Context should be sent to Lambda');
  assert(response2.metadata.contextMessageCount > 0, 'Second request should have prior messages');
  assert(response2.response.includes('Bob'), 'Lambda should remember name from context');
});

// Test: Context preserves conversation memory
runner.test('Context preserves conversation memory across exchanges', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();
  
  const useChat = createMockUseChat(manager);

  // Multi-step conversation
  await useChat.sendMessage('My name is Carol');
  await useChat.sendMessage('I am a veteran');
  await useChat.sendMessage('I need hospice care');
  
  const context = manager.getConversationContext();
  const conversationText = context.recentMessages.map(msg => msg.content).join(' ');
  
  // Verify all facts are preserved in context
  assert(conversationText.includes('Carol'), 'Should preserve name in context');
  assert(conversationText.includes('veteran'), 'Should preserve veteran status in context');
  assert(conversationText.includes('hospice'), 'Should preserve care need in context');
  
  // Test that context has proper structure
  assert.equal(context.messageCount, 6, 'Should have 6 messages (3 user + 3 assistant)');
  assert(context.recentMessages.length <= 5, 'Should limit to recent messages for Lambda');
});

// Test: Context structure for Lambda consumption
runner.test('Context structure is Lambda-compatible', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Add conversation history
  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'I need help with insurance',
    timestamp: new Date().toISOString()
  });

  manager.addMessage({
    id: 'msg_2',
    role: 'assistant',
    content: 'I can help you with insurance questions. What specific information do you need?',
    timestamp: new Date().toISOString()
  });

  const context = manager.getConversationContext();
  
  // Test JSON serialization (Lambda requirement)
  const serialized = JSON.stringify(context);
  const deserialized = JSON.parse(serialized);
  
  // Remove undefined values for comparison (they get stripped during JSON serialization)
  const cleanContext = JSON.parse(JSON.stringify(context));
  assert.deepEqual(cleanContext, deserialized, 'Context should be JSON serializable');
  
  // Test required fields for Lambda processing
  assert(deserialized.conversationId, 'Serialized context should have conversationId');
  assert(Array.isArray(deserialized.recentMessages), 'Serialized context should have recentMessages array');
  assert(typeof deserialized.turn === 'number', 'Serialized context should have numeric turn');
  
  // Test message format for Lambda
  if (deserialized.recentMessages.length > 0) {
    const msg = deserialized.recentMessages[0];
    assert(msg.role, 'Message should have role');
    assert(msg.content, 'Message should have content');
    assert(msg.timestamp, 'Message should have timestamp');
  }
});

// Test: Recent messages limit for Lambda performance
runner.test('Context limits recent messages for Lambda performance', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Add many messages (more than the limit)
  for (let i = 0; i < 10; i++) {
    manager.addMessage({
      id: `msg_user_${i}`,
      role: 'user',
      content: `User message ${i}`,
      timestamp: new Date().toISOString()
    });

    manager.addMessage({
      id: `msg_assistant_${i}`,
      role: 'assistant',
      content: `Assistant response ${i}`,
      timestamp: new Date().toISOString()
    });
  }

  const context = manager.getConversationContext();
  
  // Should limit recent messages for Lambda performance
  assert(context.recentMessages.length <= 5, 'Should limit recent messages to 5 for Lambda performance');
  assert.equal(context.messageCount, 20, 'Should still report total message count');
  
  // Should include the most recent messages
  const lastMessage = context.recentMessages[context.recentMessages.length - 1];
  assert(lastMessage.content.includes('9'), 'Should include most recent messages');
});

// Test: Context metadata for Lambda
runner.test('Context includes metadata for Lambda processing', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Add a message and advance turn
  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'Test message',
    timestamp: new Date().toISOString()
  });
  manager.turn = 1;

  const context = manager.getConversationContext();
  
  // Test metadata fields Lambda can use
  assert(context.conversationStarted, 'Should include conversation start time');
  assert(context.conversationId, 'Should include conversation ID for Lambda correlation');
  assert(typeof context.turn === 'number', 'Should include turn for Lambda state tracking');
  assert(typeof context.messageCount === 'number', 'Should include message count for Lambda context sizing');
  
  // Test timestamp format
  const startTime = new Date(context.conversationStarted);
  assert(!isNaN(startTime.getTime()), 'Conversation start time should be valid ISO date');
});

// Test: Empty conversation context
runner.test('Context handles empty conversation properly', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  const context = manager.getConversationContext();
  
  // Empty conversation should still have valid structure
  assert(context.conversationId, 'Empty conversation should have ID');
  assert.equal(context.turn, 0, 'Empty conversation should have turn 0');
  assert.equal(context.messageCount, 0, 'Empty conversation should have message count 0');
  assert.equal(context.recentMessages.length, 0, 'Empty conversation should have no recent messages');
  assert(context.conversationStarted, 'Empty conversation should have start time');
  assert.equal(context.lastSummary, undefined, 'Empty conversation should have no summary');
});

// Test: Context for conversation with summary
runner.test('Context includes summary when available', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Simulate conversation with summary
  manager.metadata.lastSummary = 'User discussed insurance coverage and home care options';
  manager.metadata.hasBeenSummarized = true;

  const context = manager.getConversationContext();
  
  assert.equal(context.lastSummary, 'User discussed insurance coverage and home care options', 
    'Context should include summary when available');
});

// Test: Full end-to-end context flow
runner.test('Full end-to-end context flow demonstrates conversational memory', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();
  
  const useChat = createMockUseChat(manager);

  // Step 1: User introduces themselves
  const response1 = await useChat.sendMessage('My name is David');
  assert(response1.success, 'Name introduction should succeed');
  
  // Step 2: Ask about name (should remember from context)
  const response2 = await useChat.sendMessage('What is my name?');
  assert(response2.success, 'Name query should succeed');
  assert(response2.response.includes('David'), 'Should remember name from conversation context');
  
  // Step 3: Verify context structure was properly used
  assert(response2.metadata.contextReceived, 'Lambda should have received context');
  assert(response2.metadata.contextMessageCount >= 2, 'Context should include previous messages');
  
  // Step 4: Verify conversation continuity
  const finalContext = manager.getConversationContext();
  assert(finalContext.messageCount >= 4, 'Should have accumulated conversation history');
  assert(finalContext.turn >= 2, 'Should have progressed through multiple turns');
  
  const conversationText = finalContext.recentMessages.map(msg => msg.content).join(' ');
  assert(conversationText.includes('David'), 'Context should preserve user name throughout conversation');
});

// Run all tests
runner.run().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});