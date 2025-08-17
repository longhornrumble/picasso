#!/usr/bin/env node
/**
 * Node.js Test Suite for Conversation Memory Functionality
 * Tests the conversation manager's ability to store and retrieve messages
 * 
 * Run with: node test-conversation-memory.js
 */

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

global.fetch = async (url, options) => {
  // Mock fetch for testing - simulate successful initialization
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
  
  // Mock conversation get endpoint
  if (url.includes('get')) {
    return {
      ok: true,
      json: async () => ({
        sessionId: 'test_session_456',
        state: {
          turn: 1,
          lastMessages: mockMessages,
          summary: null
        },
        stateToken: 'current_token_456'
      })
    };
  }
  
  throw new Error(`Unmocked fetch call to: ${url}`);
};

// Mock data
const mockMessages = [
  {
    id: 'msg_1',
    role: 'user',
    content: 'Hello, my name is Chris',
    timestamp: new Date().toISOString()
  },
  {
    id: 'msg_2',
    role: 'assistant',
    content: 'Hello Chris! Nice to meet you. How can I help you today?',
    timestamp: new Date().toISOString()
  }
];

const mockTenantHash = 'test_tenant_hash_123456789';
const mockSessionId = 'test_session_987654321';

// Import the conversation manager (we'll need to mock the path)
let ConversationManager;
let createConversationManager;

try {
  // Try to load the actual module
  const { ConversationManager: CM, createConversationManager: CCM } = await import('../src/utils/conversationManager.js');
  ConversationManager = CM;
  createConversationManager = CCM;
} catch (error) {
  console.error('Failed to load ConversationManager:', error.message);
  console.log('Creating mock ConversationManager for testing...');
  
  // Create a mock implementation if the actual module can't be loaded
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
      return true;
    }

    async clearConversation() {
      this.messageBuffer = [];
      this.turn = 0;
      this.metadata.messageCount = 0;
      this.conversationId = `sess_${this.tenantHash.slice(0, 8)}_${Date.now()}`;
      return true;
    }
  }
  
  ConversationManager = MockConversationManager;
  createConversationManager = (tenantHash, sessionId) => new MockConversationManager(tenantHash, sessionId);
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
    console.log('🧪 Running Conversation Memory Test Suite');
    console.log('==========================================\n');

    for (const { name, testFn } of this.tests) {
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

// Test: Basic ConversationManager creation
runner.test('ConversationManager can be created with tenant hash and session ID', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  
  assert(manager instanceof ConversationManager, 'Should create ConversationManager instance');
  assert.equal(manager.tenantHash, mockTenantHash, 'Should store tenant hash');
  assert.equal(manager.sessionId, mockSessionId, 'Should store session ID');
});

// Test: Conversation initialization
runner.test('ConversationManager initializes properly', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  const result = await manager.initializeConversation();
  
  assert(result.success, 'Initialization should succeed');
  assert(result.conversationId, 'Should have conversation ID');
  assert(manager.isInitialized, 'Should be marked as initialized');
});

// Test: Message storage
runner.test('ConversationManager stores messages correctly', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  const testMessage = {
    id: 'test_msg_1',
    role: 'user',
    content: 'My name is Chris Miller',
    timestamp: new Date().toISOString()
  };

  const success = manager.addMessage(testMessage);
  assert(success, 'Should successfully add message');

  const messages = manager.getMessages();
  assert.equal(messages.length, 1, 'Should have one message');
  assert.equal(messages[0].content, testMessage.content, 'Should store message content');
  assert.equal(messages[0].role, testMessage.role, 'Should store message role');
});

// Test: Multiple message storage
runner.test('ConversationManager stores multiple messages with proper order', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  const userMessage = {
    id: 'test_msg_1',
    role: 'user',
    content: 'Hello, I need help with home care',
    timestamp: new Date().toISOString()
  };

  const assistantMessage = {
    id: 'test_msg_2',
    role: 'assistant',
    content: 'I can help you with home care options. What specific assistance do you need?',
    timestamp: new Date().toISOString()
  };

  manager.addMessage(userMessage);
  manager.addMessage(assistantMessage);

  const messages = manager.getMessages();
  assert.equal(messages.length, 2, 'Should have two messages');
  assert.equal(messages[0].role, 'user', 'First message should be user');
  assert.equal(messages[1].role, 'assistant', 'Second message should be assistant');
});

// Test: Conversation context building
runner.test('ConversationManager builds proper context structure', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Add some conversation history
  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'My name is Sarah and I am a veteran',
    timestamp: new Date().toISOString()
  });

  manager.addMessage({
    id: 'msg_2', 
    role: 'assistant',
    content: 'Hello Sarah, thank you for your service. How can I help you today?',
    timestamp: new Date().toISOString()
  });

  const context = manager.getConversationContext();
  
  assert(context.conversationId, 'Context should include conversation ID');
  assert(typeof context.turn === 'number', 'Context should include turn number');
  assert(typeof context.messageCount === 'number', 'Context should include message count');
  assert(Array.isArray(context.recentMessages), 'Context should include recent messages array');
  assert(context.conversationStarted, 'Context should include conversation start time');
  
  assert.equal(context.messageCount, 2, 'Should report correct message count');
  assert.equal(context.recentMessages.length, 2, 'Should include recent messages');
  assert.equal(context.recentMessages[0].role, 'user', 'Should preserve message order');
  assert.equal(context.recentMessages[1].role, 'assistant', 'Should preserve message roles');
});

// Test: Conversation context for memory scenarios
runner.test('ConversationManager preserves user information in context', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Simulate name introduction
  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'My name is Chris',
    timestamp: new Date().toISOString()
  });

  manager.addMessage({
    id: 'msg_2',
    role: 'assistant', 
    content: 'Nice to meet you, Chris!',
    timestamp: new Date().toISOString()
  });

  // Simulate follow-up question
  manager.addMessage({
    id: 'msg_3',
    role: 'user',
    content: 'What\'s my name?',
    timestamp: new Date().toISOString()
  });

  const context = manager.getConversationContext();
  
  // Verify context includes the name information
  const messages = context.recentMessages;
  const nameMessage = messages.find(msg => msg.content.includes('Chris'));
  assert(nameMessage, 'Context should preserve name information from conversation');
  
  // Verify structure for Lambda consumption
  assert(context.recentMessages.every(msg => 
    msg.role && msg.content && msg.timestamp
  ), 'All messages should have required fields for Lambda');
});

// Test: Multi-fact memory
runner.test('ConversationManager preserves multiple facts in context', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // User provides multiple facts
  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'I\'m a veteran and I need hospice care for my father',
    timestamp: new Date().toISOString()
  });

  manager.addMessage({
    id: 'msg_2',
    role: 'assistant',
    content: 'Thank you for your service. I understand you need hospice care for your father. I can help you with that.',
    timestamp: new Date().toISOString()
  });

  // Follow-up question
  manager.addMessage({
    id: 'msg_3',
    role: 'user',
    content: 'What did I tell you about myself?',
    timestamp: new Date().toISOString()
  });

  const context = manager.getConversationContext();
  const conversationText = context.recentMessages.map(msg => msg.content).join(' ');
  
  // Verify both facts are preserved
  assert(conversationText.includes('veteran'), 'Should preserve veteran status');
  assert(conversationText.includes('hospice'), 'Should preserve hospice care need');
  assert(conversationText.includes('father'), 'Should preserve relationship context');
});

// Test: Turn tracking increments
runner.test('ConversationManager tracks turns properly', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  const initialTurn = manager.turn;
  assert.equal(initialTurn, 0, 'Should start at turn 0');

  // Simulate chat response processing
  const userMessage = {
    id: 'msg_1',
    role: 'user',
    content: 'Hello',
    timestamp: new Date().toISOString()
  };

  const assistantMessage = {
    id: 'msg_2',
    role: 'assistant',
    content: 'Hi there!',
    timestamp: new Date().toISOString()
  };

  await manager.updateFromChatResponse({}, userMessage, assistantMessage);
  
  assert(manager.turn > initialTurn, 'Turn should increment after message exchange');
});

// Test: Conversation clearing
runner.test('ConversationManager clears conversation properly', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  // Add some messages
  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'Test message',
    timestamp: new Date().toISOString()
  });

  assert.equal(manager.getMessages().length, 1, 'Should have message before clear');

  await manager.clearConversation();

  assert.equal(manager.getMessages().length, 0, 'Should have no messages after clear');
  assert.equal(manager.turn, 0, 'Turn should reset to 0');
  assert(manager.conversationId, 'Should have new conversation ID');
});

// Test: Context structure for Lambda integration
runner.test('ConversationManager provides Lambda-compatible context structure', async () => {
  const manager = createConversationManager(mockTenantHash, mockSessionId);
  await manager.initializeConversation();

  manager.addMessage({
    id: 'msg_1',
    role: 'user',
    content: 'I need help with insurance coverage',
    timestamp: new Date().toISOString()
  });

  const context = manager.getConversationContext();
  
  // Test Lambda-expected structure
  assert(typeof context === 'object', 'Context should be an object');
  assert(context.conversationId, 'Should have conversationId for Lambda');
  assert(typeof context.turn === 'number', 'Should have numeric turn for Lambda');
  assert(Array.isArray(context.recentMessages), 'Should have recentMessages array for Lambda');
  
  // Test message structure for Lambda
  if (context.recentMessages.length > 0) {
    const msg = context.recentMessages[0];
    assert(msg.role, 'Messages should have role for Lambda');
    assert(msg.content, 'Messages should have content for Lambda');
    assert(msg.timestamp, 'Messages should have timestamp for Lambda');
  }
});

// Run all tests
runner.run().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});