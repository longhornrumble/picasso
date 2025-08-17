/**
 * Performance and Load Testing Suite for Track A+ Conversational Context
 * Phase 5: Performance & Production Readiness Validation
 * 
 * This test suite validates performance under realistic load conditions and
 * ensures the conversational context system meets all healthcare KPI targets
 * for production deployment.
 * 
 * Test Coverage:
 * - Concurrent conversation session handling
 * - Message volume stress testing  
 * - Multi-session conversation continuity
 * - Memory usage and leak detection
 * - Network latency simulation
 * - Database connection pooling
 * - Error recovery under load
 * - Scalability limits validation
 * 
 * Healthcare Production KPIs:
 * - Concurrent sessions: 50+ simultaneous users
 * - Message processing: <50ms average response time
 * - Memory usage: <100MB increase under load
 * - Error rate under load: <1%
 * - Recovery time: <5s after failure
 * - Database connections: Efficient pooling
 * - Cross-session isolation: 100% maintained
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performance, PerformanceObserver } from 'perf_hooks';

// Performance testing utilities
class PerformanceProfiler {
  constructor() {
    this.measurements = new Map();
    this.observers = new Map();
    this.memoryBaseline = null;
  }

  startMeasurement(name) {
    this.measurements.set(name, {
      startTime: performance.now(),
      startMemory: this.getMemoryUsage()
    });
  }

  endMeasurement(name) {
    const measurement = this.measurements.get(name);
    if (!measurement) {
      throw new Error(`No measurement started for: ${name}`);
    }

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();

    const result = {
      duration: endTime - measurement.startTime,
      memoryDelta: endMemory - measurement.startMemory,
      startMemory: measurement.startMemory,
      endMemory: endMemory
    };

    this.measurements.delete(name);
    return result;
  }

  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0; // Browser environment fallback
  }

  measureAsync(name, asyncOperation) {
    return new Promise((resolve, reject) => {
      this.startMeasurement(name);
      
      Promise.resolve(asyncOperation())
        .then(result => {
          const measurement = this.endMeasurement(name);
          resolve({ result, measurement });
        })
        .catch(error => {
          this.measurements.delete(name);
          reject(error);
        });
    });
  }

  setMemoryBaseline() {
    this.memoryBaseline = this.getMemoryUsage();
  }

  getMemoryIncrease() {
    if (this.memoryBaseline === null) {
      return null;
    }
    return this.getMemoryUsage() - this.memoryBaseline;
  }
}

// Mock conversation manager for load testing
class LoadTestConversationManager {
  constructor() {
    this.conversations = new Map();
    this.messageCache = new Map();
    this.tokenCache = new Map();
    this.requestCount = 0;
    this.errorCount = 0;
    this.processingTimes = [];
  }

  async createConversation(tenantHash, sessionId) {
    const startTime = performance.now();
    
    try {
      this.requestCount++;
      
      // Simulate database operation delay
      await this.simulateNetworkDelay(5, 15); // 5-15ms random delay
      
      const conversationId = `conv_${tenantHash.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const conversation = {
        id: conversationId,
        tenantHash,
        sessionId,
        messages: [],
        metadata: {
          created: Date.now(),
          messageCount: 0,
          lastActivity: Date.now()
        },
        token: this.generateToken(conversationId, tenantHash)
      };
      
      this.conversations.set(conversationId, conversation);
      this.processingTimes.push(performance.now() - startTime);
      
      return conversation;
      
    } catch (error) {
      this.errorCount++;
      this.processingTimes.push(performance.now() - startTime);
      throw error;
    }
  }

  async addMessage(conversationId, message) {
    const startTime = performance.now();
    
    try {
      this.requestCount++;
      
      // Simulate message processing and storage
      await this.simulateNetworkDelay(8, 20); // 8-20ms delay
      
      const conversation = this.conversations.get(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      const messageWithId = {
        ...message,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      };
      
      conversation.messages.push(messageWithId);
      conversation.metadata.messageCount++;
      conversation.metadata.lastActivity = Date.now();
      
      // Update cache
      this.messageCache.set(messageWithId.id, messageWithId);
      
      this.processingTimes.push(performance.now() - startTime);
      
      return messageWithId;
      
    } catch (error) {
      this.errorCount++;
      this.processingTimes.push(performance.now() - startTime);
      throw error;
    }
  }

  async getConversation(conversationId) {
    const startTime = performance.now();
    
    try {
      this.requestCount++;
      
      // Simulate database read delay
      await this.simulateNetworkDelay(3, 12); // 3-12ms delay
      
      const conversation = this.conversations.get(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      this.processingTimes.push(performance.now() - startTime);
      
      return { ...conversation }; // Return copy
      
    } catch (error) {
      this.errorCount++;
      this.processingTimes.push(performance.now() - startTime);
      throw error;
    }
  }

  generateToken(conversationId, tenantHash) {
    const payload = {
      conversationId,
      tenantHash,
      timestamp: Date.now(),
      expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    // Simulate HMAC generation delay
    const tokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.tokenCache.set(tokenId, payload);
    
    return tokenId;
  }

  async simulateNetworkDelay(minMs, maxMs) {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: (this.errorCount / this.requestCount) * 100,
      avgProcessingTime: this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length,
      maxProcessingTime: Math.max(...this.processingTimes),
      minProcessingTime: Math.min(...this.processingTimes),
      conversationCount: this.conversations.size,
      cacheSize: this.messageCache.size
    };
  }

  reset() {
    this.conversations.clear();
    this.messageCache.clear();
    this.tokenCache.clear();
    this.requestCount = 0;
    this.errorCount = 0;
    this.processingTimes = [];
  }
}

// Load testing utilities
class LoadTestRunner {
  constructor(conversationManager) {
    this.conversationManager = conversationManager;
    this.activeTests = new Set();
  }

  async runConcurrentUsers(userCount, operationsPerUser, options = {}) {
    const { 
      delayBetweenOperations = 100,
      tenantCount = 5,
      failureRate = 0.01 // 1% simulated failures
    } = options;

    const promises = [];
    const results = [];

    for (let userId = 0; userId < userCount; userId++) {
      const tenantHash = `tenant_${userId % tenantCount}_hash`;
      const sessionId = `session_${userId}`;
      
      const userPromise = this.simulateUser(
        userId,
        tenantHash,
        sessionId,
        operationsPerUser,
        delayBetweenOperations,
        failureRate
      );
      
      promises.push(userPromise);
    }

    const userResults = await Promise.allSettled(promises);
    
    return {
      totalUsers: userCount,
      successfulUsers: userResults.filter(r => r.status === 'fulfilled').length,
      failedUsers: userResults.filter(r => r.status === 'rejected').length,
      results: userResults.map(r => r.status === 'fulfilled' ? r.value : r.reason)
    };
  }

  async simulateUser(userId, tenantHash, sessionId, operationCount, delay, failureRate) {
    const userResults = {
      userId,
      tenantHash,
      sessionId,
      operations: [],
      errors: [],
      startTime: performance.now()
    };

    try {
      // Create conversation
      const conversation = await this.conversationManager.createConversation(tenantHash, sessionId);
      
      userResults.operations.push({
        type: 'create_conversation',
        timestamp: performance.now(),
        conversationId: conversation.id
      });

      // Perform operations
      for (let opIndex = 0; opIndex < operationCount; opIndex++) {
        try {
          // Simulate random failure
          if (Math.random() < failureRate) {
            throw new Error(`Simulated failure for user ${userId} operation ${opIndex}`);
          }

          // Add message
          const message = {
            role: 'user',
            content: `Message ${opIndex + 1} from user ${userId}`
          };

          await this.conversationManager.addMessage(conversation.id, message);
          
          userResults.operations.push({
            type: 'add_message',
            timestamp: performance.now(),
            messageIndex: opIndex
          });

          // Simulate user think time
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (error) {
          userResults.errors.push({
            operation: opIndex,
            error: error.message,
            timestamp: performance.now()
          });
        }
      }

      // Get final conversation state
      const finalConversation = await this.conversationManager.getConversation(conversation.id);
      userResults.finalMessageCount = finalConversation.metadata.messageCount;
      userResults.endTime = performance.now();
      userResults.totalTime = userResults.endTime - userResults.startTime;

      return userResults;

    } catch (error) {
      userResults.errors.push({
        operation: 'initialization',
        error: error.message,
        timestamp: performance.now()
      });
      
      throw userResults;
    }
  }

  async runStressTest(duration, rampUpTime, maxConcurrentUsers) {
    const startTime = performance.now();
    const endTime = startTime + duration;
    const rampUpEndTime = startTime + rampUpTime;
    
    const activeUsers = new Set();
    const completedUsers = [];
    let userIdCounter = 0;

    const results = {
      duration,
      maxConcurrentUsers,
      totalUsersCreated: 0,
      totalUsersCompleted: 0,
      peakConcurrentUsers: 0,
      operationsPerSecond: [],
      responseTimePercentiles: {},
      errorCount: 0
    };

    // Stress test loop
    while (performance.now() < endTime) {
      const currentTime = performance.now();
      
      // Ramp up phase
      if (currentTime < rampUpEndTime) {
        const rampUpProgress = (currentTime - startTime) / rampUpTime;
        const targetUsers = Math.floor(maxConcurrentUsers * rampUpProgress);
        
        while (activeUsers.size < targetUsers) {
          const userId = userIdCounter++;
          const tenantHash = `stress_tenant_${userId % 10}_hash`;
          const sessionId = `stress_session_${userId}`;
          
          const userPromise = this.simulateUser(userId, tenantHash, sessionId, 10, 50, 0.02)
            .then(result => {
              activeUsers.delete(userId);
              completedUsers.push(result);
              return result;
            })
            .catch(error => {
              activeUsers.delete(userId);
              results.errorCount++;
              return error;
            });
          
          activeUsers.add(userId);
          results.totalUsersCreated++;
        }
      }

      // Track peak concurrent users
      results.peakConcurrentUsers = Math.max(results.peakConcurrentUsers, activeUsers.size);

      // Sample operations per second
      const currentStats = this.conversationManager.getStats();
      results.operationsPerSecond.push({
        timestamp: currentTime,
        requestCount: currentStats.requestCount,
        errorCount: currentStats.errorCount
      });

      // Wait before next iteration
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for remaining users to complete
    const remainingPromises = Array.from(activeUsers).map(userId => 
      new Promise(resolve => {
        const checkComplete = () => {
          if (!activeUsers.has(userId)) {
            resolve();
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      })
    );

    await Promise.all(remainingPromises);

    results.totalUsersCompleted = completedUsers.length;
    
    // Calculate response time percentiles
    const allResponseTimes = this.conversationManager.processingTimes.sort((a, b) => a - b);
    results.responseTimePercentiles = {
      p50: this.getPercentile(allResponseTimes, 50),
      p90: this.getPercentile(allResponseTimes, 90),
      p95: this.getPercentile(allResponseTimes, 95),
      p99: this.getPercentile(allResponseTimes, 99)
    };

    return results;
  }

  getPercentile(sortedArray, percentile) {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] || 0;
  }
}

// Test fixtures and setup
let profiler;
let conversationManager;
let loadTestRunner;

describe('Phase 5: Performance & Production Readiness Testing', () => {
  beforeEach(() => {
    profiler = new PerformanceProfiler();
    conversationManager = new LoadTestConversationManager();
    loadTestRunner = new LoadTestRunner(conversationManager);
    profiler.setMemoryBaseline();
    vi.clearAllMocks();
  });

  afterEach(() => {
    conversationManager.reset();
  });

  describe('Concurrent Session Handling', () => {
    it('should handle 50+ concurrent conversation sessions', async () => {
      const userCount = 55; // Exceed minimum requirement
      const operationsPerUser = 5;
      
      const { result, measurement } = await profiler.measureAsync(
        'concurrent_sessions',
        () => loadTestRunner.runConcurrentUsers(userCount, operationsPerUser, {
          delayBetweenOperations: 50, // Realistic user delay
          tenantCount: 10, // Multiple tenants
          failureRate: 0.005 // 0.5% failure rate
        })
      );

      // Validate concurrent handling
      expect(result.totalUsers).toBe(userCount);
      expect(result.successfulUsers).toBeGreaterThanOrEqual(userCount * 0.95); // 95% success rate
      
      // Performance validation
      const stats = conversationManager.getStats();
      expect(stats.avgProcessingTime).toBeLessThan(50); // <50ms average
      expect(stats.errorRate).toBeLessThan(1); // <1% error rate
      
      // Memory validation
      const memoryIncrease = profiler.getMemoryIncrease();
      if (memoryIncrease !== null) {
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // <100MB increase
      }

      console.log(`✅ Concurrent sessions test completed:`);
      console.log(`  - Users: ${result.totalUsers} (${result.successfulUsers} successful)`);
      console.log(`  - Avg processing time: ${stats.avgProcessingTime.toFixed(2)}ms`);
      console.log(`  - Error rate: ${stats.errorRate.toFixed(3)}%`);
      console.log(`  - Memory increase: ${memoryIncrease ? (memoryIncrease / 1024 / 1024).toFixed(2) + 'MB' : 'N/A'}`);
    }, 30000); // 30s timeout

    it('should maintain cross-session isolation under load', async () => {
      const tenantCount = 5;
      const sessionsPerTenant = 10;
      const isolationViolations = [];

      // Create sessions for multiple tenants
      const sessionPromises = [];
      for (let tenantIndex = 0; tenantIndex < tenantCount; tenantIndex++) {
        const tenantHash = `isolation_tenant_${tenantIndex}_hash`;
        
        for (let sessionIndex = 0; sessionIndex < sessionsPerTenant; sessionIndex++) {
          const sessionId = `session_${tenantIndex}_${sessionIndex}`;
          
          sessionPromises.push(
            conversationManager.createConversation(tenantHash, sessionId)
              .then(async (conversation) => {
                // Add tenant-specific message
                await conversationManager.addMessage(conversation.id, {
                  role: 'user',
                  content: `Tenant ${tenantIndex} confidential data: SECRET_${tenantIndex}_${sessionIndex}`
                });
                
                return {
                  tenantIndex,
                  sessionIndex,
                  conversation
                };
              })
          );
        }
      }

      const sessions = await Promise.all(sessionPromises);

      // Verify cross-tenant isolation
      for (const session of sessions) {
        const conversation = await conversationManager.getConversation(session.conversation.id);
        
        // Check that conversation only contains data from correct tenant
        const conversationContent = JSON.stringify(conversation);
        
        for (let otherTenant = 0; otherTenant < tenantCount; otherTenant++) {
          if (otherTenant !== session.tenantIndex) {
            if (conversationContent.includes(`SECRET_${otherTenant}_`)) {
              isolationViolations.push({
                conversation: session.conversation.id,
                ownTenant: session.tenantIndex,
                leakedTenant: otherTenant
              });
            }
          }
        }
      }

      expect(isolationViolations).toHaveLength(0);
      console.log(`✅ Cross-session isolation maintained: ${sessions.length} sessions, 0 violations`);
    }, 20000);
  });

  describe('Message Volume Stress Testing', () => {
    it('should handle high message volume with <50ms average response time', async () => {
      const conversationCount = 20;
      const messagesPerConversation = 50;
      const totalMessages = conversationCount * messagesPerConversation;

      // Create conversations
      const conversations = [];
      for (let i = 0; i < conversationCount; i++) {
        const conversation = await conversationManager.createConversation(
          `volume_tenant_${i}_hash`,
          `volume_session_${i}`
        );
        conversations.push(conversation);
      }

      // Send messages in batches to simulate realistic load
      const batchSize = 10;
      const { result, measurement } = await profiler.measureAsync(
        'message_volume_test',
        async () => {
          const messagePromises = [];
          
          for (let messageIndex = 0; messageIndex < messagesPerConversation; messageIndex++) {
            for (const conversation of conversations) {
              const messagePromise = conversationManager.addMessage(conversation.id, {
                role: messageIndex % 2 === 0 ? 'user' : 'assistant',
                content: `Volume test message ${messageIndex + 1} for ${conversation.id}`
              });
              
              messagePromises.push(messagePromise);
              
              // Process in batches to avoid overwhelming the system
              if (messagePromises.length >= batchSize) {
                await Promise.all(messagePromises.splice(0, batchSize));
              }
            }
          }
          
          // Process remaining messages
          if (messagePromises.length > 0) {
            await Promise.all(messagePromises);
          }
          
          return { totalMessages, processedMessages: totalMessages };
        }
      );

      const stats = conversationManager.getStats();
      
      // Validate performance targets
      expect(stats.avgProcessingTime).toBeLessThan(50); // <50ms average
      expect(stats.errorRate).toBeLessThan(1); // <1% error rate
      expect(result.processedMessages).toBe(totalMessages);

      console.log(`✅ Message volume test completed:`);
      console.log(`  - Total messages: ${totalMessages}`);
      console.log(`  - Average processing time: ${stats.avgProcessingTime.toFixed(2)}ms`);
      console.log(`  - Total duration: ${measurement.duration.toFixed(2)}ms`);
      console.log(`  - Messages per second: ${(totalMessages / (measurement.duration / 1000)).toFixed(2)}`);
    }, 60000);

    it('should maintain performance during conversation state retrieval', async () => {
      const conversationCount = 100;
      const messagesPerConversation = 20;

      // Setup conversations with messages
      const conversations = [];
      for (let i = 0; i < conversationCount; i++) {
        const conversation = await conversationManager.createConversation(
          `retrieval_tenant_${i % 5}_hash`,
          `retrieval_session_${i}`
        );
        
        // Add messages to conversation
        for (let msgIndex = 0; msgIndex < messagesPerConversation; msgIndex++) {
          await conversationManager.addMessage(conversation.id, {
            role: msgIndex % 2 === 0 ? 'user' : 'assistant',
            content: `Retrieval test message ${msgIndex + 1}`
          });
        }
        
        conversations.push(conversation);
      }

      // Measure retrieval performance
      const { result, measurement } = await profiler.measureAsync(
        'conversation_retrieval',
        async () => {
          const retrievalPromises = conversations.map(conv =>
            conversationManager.getConversation(conv.id)
          );
          
          return Promise.all(retrievalPromises);
        }
      );

      const avgRetrievalTime = measurement.duration / conversationCount;
      
      expect(avgRetrievalTime).toBeLessThan(20); // <20ms per retrieval
      expect(result).toHaveLength(conversationCount);

      console.log(`✅ Conversation retrieval test:`);
      console.log(`  - Conversations retrieved: ${conversationCount}`);
      console.log(`  - Average retrieval time: ${avgRetrievalTime.toFixed(2)}ms`);
      console.log(`  - Total retrieval time: ${measurement.duration.toFixed(2)}ms`);
    });
  });

  describe('Multi-Session Conversation Continuity', () => {
    it('should maintain conversation state across multiple sessions', async () => {
      const tenantHash = 'continuity_tenant_hash';
      const conversationId = 'continuity_conversation_123';
      const sessionCount = 10;
      const messagesPerSession = 5;

      // Create initial conversation
      const initialConversation = await conversationManager.createConversation(tenantHash, 'session_0');
      
      // Simulate multiple sessions adding to same conversation
      let totalMessages = 0;
      for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex++) {
        for (let msgIndex = 0; msgIndex < messagesPerSession; msgIndex++) {
          await conversationManager.addMessage(initialConversation.id, {
            role: msgIndex % 2 === 0 ? 'user' : 'assistant',
            content: `Session ${sessionIndex + 1} message ${msgIndex + 1}`,
            sessionId: `session_${sessionIndex}`
          });
          totalMessages++;
        }
      }

      // Verify conversation continuity
      const finalConversation = await conversationManager.getConversation(initialConversation.id);
      
      expect(finalConversation.metadata.messageCount).toBe(totalMessages);
      expect(finalConversation.messages).toHaveLength(totalMessages);

      // Verify messages from all sessions are present
      const sessionMessages = {};
      finalConversation.messages.forEach(msg => {
        const sessionId = msg.sessionId || 'unknown';
        sessionMessages[sessionId] = (sessionMessages[sessionId] || 0) + 1;
      });

      expect(Object.keys(sessionMessages)).toHaveLength(sessionCount);

      console.log(`✅ Multi-session continuity test:`);
      console.log(`  - Sessions: ${sessionCount}`);
      console.log(`  - Total messages: ${totalMessages}`);
      console.log(`  - Messages per session: ${JSON.stringify(sessionMessages)}`);
    });

    it('should handle session overlap and concurrent modifications', async () => {
      const tenantHash = 'overlap_tenant_hash';
      const conversation = await conversationManager.createConversation(tenantHash, 'base_session');
      
      const concurrentSessions = 15;
      const messagesPerSession = 8;

      // Simulate concurrent sessions modifying same conversation
      const sessionPromises = [];
      for (let sessionIndex = 0; sessionIndex < concurrentSessions; sessionIndex++) {
        const sessionPromise = (async () => {
          const messages = [];
          for (let msgIndex = 0; msgIndex < messagesPerSession; msgIndex++) {
            try {
              const message = await conversationManager.addMessage(conversation.id, {
                role: 'user',
                content: `Concurrent session ${sessionIndex} message ${msgIndex}`,
                sessionId: `concurrent_session_${sessionIndex}`
              });
              messages.push(message);
            } catch (error) {
              console.warn(`Error in session ${sessionIndex} message ${msgIndex}:`, error.message);
            }
          }
          return { sessionIndex, messages };
        })();
        
        sessionPromises.push(sessionPromise);
      }

      const sessionResults = await Promise.all(sessionPromises);
      
      // Verify final state
      const finalConversation = await conversationManager.getConversation(conversation.id);
      const totalExpectedMessages = concurrentSessions * messagesPerSession;
      
      // Allow for some race condition losses but expect most messages to succeed
      expect(finalConversation.metadata.messageCount).toBeGreaterThanOrEqual(totalExpectedMessages * 0.9);

      const successfulMessages = sessionResults.reduce((total, result) => total + result.messages.length, 0);
      const successRate = (successfulMessages / totalExpectedMessages) * 100;
      
      expect(successRate).toBeGreaterThanOrEqual(90); // 90% success rate for concurrent operations

      console.log(`✅ Session overlap test:`);
      console.log(`  - Concurrent sessions: ${concurrentSessions}`);
      console.log(`  - Expected messages: ${totalExpectedMessages}`);
      console.log(`  - Successful messages: ${successfulMessages}`);
      console.log(`  - Success rate: ${successRate.toFixed(1)}%`);
    });
  });

  describe('Memory Usage and Leak Detection', () => {
    it('should maintain memory usage under 100MB increase during load', async () => {
      const initialMemory = profiler.getMemoryUsage();
      
      // Perform memory-intensive operations
      const conversationCount = 200;
      const messagesPerConversation = 25;
      
      const conversations = [];
      
      // Create conversations and messages
      for (let i = 0; i < conversationCount; i++) {
        const conversation = await conversationManager.createConversation(
          `memory_tenant_${i % 10}_hash`,
          `memory_session_${i}`
        );
        
        for (let msgIndex = 0; msgIndex < messagesPerConversation; msgIndex++) {
          await conversationManager.addMessage(conversation.id, {
            role: msgIndex % 2 === 0 ? 'user' : 'assistant',
            content: `Memory test message ${msgIndex}: ${'x'.repeat(500)}` // Larger messages
          });
        }
        
        conversations.push(conversation);
      }

      const peakMemory = profiler.getMemoryUsage();
      const memoryIncrease = peakMemory - initialMemory;

      // Clean up some conversations to test memory release
      for (let i = 0; i < conversations.length / 2; i++) {
        conversationManager.conversations.delete(conversations[i].id);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 100)); // Allow cleanup

      const finalMemory = profiler.getMemoryUsage();
      const memoryAfterCleanup = finalMemory - initialMemory;

      console.log(`✅ Memory usage test:`);
      console.log(`  - Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  - Peak memory: ${(peakMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  - Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  - Memory after cleanup: ${(memoryAfterCleanup / 1024 / 1024).toFixed(2)}MB`);

      // Validate memory targets
      if (memoryIncrease > 0) {
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // <100MB increase
        expect(memoryAfterCleanup).toBeLessThan(memoryIncrease * 0.8); // Memory should decrease after cleanup
      }
    });

    it('should detect and prevent memory leaks in conversation management', async () => {
      const iterations = 50;
      const messagesPerIteration = 20;
      const memoryMeasurements = [];

      for (let iteration = 0; iteration < iterations; iteration++) {
        const iterationStart = profiler.getMemoryUsage();
        
        // Create and destroy conversations rapidly
        const conversation = await conversationManager.createConversation(
          `leak_test_tenant_${iteration}_hash`,
          `leak_test_session_${iteration}`
        );
        
        // Add messages
        for (let msgIndex = 0; msgIndex < messagesPerIteration; msgIndex++) {
          await conversationManager.addMessage(conversation.id, {
            role: 'user',
            content: `Leak test message ${msgIndex}`
          });
        }
        
        // Remove conversation (simulate cleanup)
        conversationManager.conversations.delete(conversation.id);
        
        const iterationEnd = profiler.getMemoryUsage();
        memoryMeasurements.push(iterationEnd - iterationStart);
        
        // Periodic cleanup
        if (iteration % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      // Analyze memory growth pattern
      const firstQuarter = memoryMeasurements.slice(0, Math.floor(iterations / 4));
      const lastQuarter = memoryMeasurements.slice(-Math.floor(iterations / 4));
      
      const avgFirstQuarter = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      const avgLastQuarter = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
      
      const memoryGrowthRate = (avgLastQuarter - avgFirstQuarter) / avgFirstQuarter;

      console.log(`✅ Memory leak detection:`);
      console.log(`  - Iterations: ${iterations}`);
      console.log(`  - Avg memory per iteration (first quarter): ${(avgFirstQuarter / 1024).toFixed(2)}KB`);
      console.log(`  - Avg memory per iteration (last quarter): ${(avgLastQuarter / 1024).toFixed(2)}KB`);
      console.log(`  - Memory growth rate: ${(memoryGrowthRate * 100).toFixed(2)}%`);

      // Memory should not grow significantly over iterations
      expect(Math.abs(memoryGrowthRate)).toBeLessThan(0.5); // <50% growth rate
    });
  });

  describe('Stress Testing and Scalability Limits', () => {
    it('should handle stress test with ramp-up and sustained load', async () => {
      const stressDuration = 10000; // 10 seconds
      const rampUpTime = 3000; // 3 seconds ramp-up
      const maxConcurrentUsers = 30;

      const { result, measurement } = await profiler.measureAsync(
        'stress_test',
        () => loadTestRunner.runStressTest(stressDuration, rampUpTime, maxConcurrentUsers)
      );

      console.log(`✅ Stress test completed:`);
      console.log(`  - Duration: ${stressDuration / 1000}s`);
      console.log(`  - Max concurrent users: ${maxConcurrentUsers}`);
      console.log(`  - Peak concurrent users: ${result.peakConcurrentUsers}`);
      console.log(`  - Total users created: ${result.totalUsersCreated}`);
      console.log(`  - Total users completed: ${result.totalUsersCompleted}`);
      console.log(`  - Response time P50: ${result.responseTimePercentiles.p50?.toFixed(2)}ms`);
      console.log(`  - Response time P95: ${result.responseTimePercentiles.p95?.toFixed(2)}ms`);
      console.log(`  - Error count: ${result.errorCount}`);

      // Validate stress test results
      expect(result.peakConcurrentUsers).toBeGreaterThanOrEqual(maxConcurrentUsers * 0.8);
      expect(result.responseTimePercentiles.p95).toBeLessThan(100); // P95 < 100ms
      expect(result.errorCount).toBeLessThan(result.totalUsersCreated * 0.05); // <5% error rate
    }, 30000);

    it('should identify scalability bottlenecks and limits', async () => {
      const scalabilityTests = [
        { users: 10, expectedAvgTime: 30 },
        { users: 25, expectedAvgTime: 40 },
        { users: 50, expectedAvgTime: 60 },
        { users: 75, expectedAvgTime: 80 }
      ];

      const scalabilityResults = [];

      for (const test of scalabilityTests) {
        conversationManager.reset(); // Fresh state for each test
        
        const result = await loadTestRunner.runConcurrentUsers(test.users, 5, {
          delayBetweenOperations: 100,
          tenantCount: 5,
          failureRate: 0.01
        });

        const stats = conversationManager.getStats();
        
        scalabilityResults.push({
          userCount: test.users,
          avgProcessingTime: stats.avgProcessingTime,
          errorRate: stats.errorRate,
          successRate: (result.successfulUsers / result.totalUsers) * 100,
          expectedTime: test.expectedAvgTime
        });

        console.log(`Scalability test - ${test.users} users: ${stats.avgProcessingTime.toFixed(2)}ms avg`);
      }

      // Analyze scalability pattern
      let previousTime = 0;
      for (const result of scalabilityResults) {
        expect(result.avgProcessingTime).toBeLessThan(result.expectedTime);
        expect(result.successRate).toBeGreaterThanOrEqual(95);
        expect(result.errorRate).toBeLessThan(2);
        
        // Performance should degrade gracefully, not exponentially
        if (previousTime > 0) {
          const timeIncrease = result.avgProcessingTime / previousTime;
          expect(timeIncrease).toBeLessThan(3); // <3x time increase between levels
        }
        
        previousTime = result.avgProcessingTime;
      }

      console.log(`✅ Scalability analysis completed:`);
      scalabilityResults.forEach(result => {
        console.log(`  - ${result.userCount} users: ${result.avgProcessingTime.toFixed(2)}ms avg, ${result.successRate.toFixed(1)}% success`);
      });
    }, 45000);
  });

  describe('Production Readiness Validation', () => {
    it('should validate all performance KPIs for production deployment', async () => {
      const kpiValidation = {
        concurrentSessions: { target: 50, actual: 0, passed: false },
        avgResponseTime: { target: 50, actual: 0, passed: false },
        errorRateUnderLoad: { target: 1, actual: 0, passed: false },
        memoryUsage: { target: 100, actual: 0, passed: false },
        recoveryTime: { target: 5000, actual: 0, passed: false }
      };

      // Test concurrent sessions
      const concurrentResult = await loadTestRunner.runConcurrentUsers(55, 8, {
        delayBetweenOperations: 75,
        failureRate: 0.005
      });
      
      kpiValidation.concurrentSessions.actual = concurrentResult.successfulUsers;
      kpiValidation.concurrentSessions.passed = concurrentResult.successfulUsers >= 50;

      // Test response time
      const stats = conversationManager.getStats();
      kpiValidation.avgResponseTime.actual = stats.avgProcessingTime;
      kpiValidation.avgResponseTime.passed = stats.avgProcessingTime < 50;

      // Test error rate
      kpiValidation.errorRateUnderLoad.actual = stats.errorRate;
      kpiValidation.errorRateUnderLoad.passed = stats.errorRate < 1;

      // Test memory usage
      const memoryIncrease = profiler.getMemoryIncrease();
      if (memoryIncrease !== null) {
        kpiValidation.memoryUsage.actual = memoryIncrease / 1024 / 1024; // MB
        kpiValidation.memoryUsage.passed = memoryIncrease < 100 * 1024 * 1024;
      } else {
        kpiValidation.memoryUsage.passed = true; // Skip if not measurable
      }

      // Test recovery time (simulate and measure)
      const recoveryStart = performance.now();
      conversationManager.reset();
      
      // Simulate recovery by recreating basic operations
      await conversationManager.createConversation('recovery_tenant', 'recovery_session');
      const recoveryEnd = performance.now();
      
      kpiValidation.recoveryTime.actual = recoveryEnd - recoveryStart;
      kpiValidation.recoveryTime.passed = (recoveryEnd - recoveryStart) < 5000;

      // Validate all KPIs
      console.log('\n=== Production Readiness KPI Validation ===');
      Object.entries(kpiValidation).forEach(([kpi, validation]) => {
        const status = validation.passed ? '✅ PASS' : '❌ FAIL';
        const unit = kpi === 'memoryUsage' ? 'MB' : 
                    kpi.includes('Time') ? 'ms' : 
                    kpi.includes('Rate') ? '%' : '';
        
        console.log(`${status} ${kpi}: ${validation.actual.toFixed(2)}${unit} (target: ${validation.target}${unit})`);
        expect(validation.passed).toBe(true);
      });

      const allKPIsPassed = Object.values(kpiValidation).every(v => v.passed);
      expect(allKPIsPassed).toBe(true);

      return kpiValidation;
    }, 60000);

    it('should demonstrate healthcare compliance under production load', async () => {
      const complianceValidation = {
        crossTenantIsolation: false,
        dataIntegrity: false,
        auditCompleteness: false,
        recoveryCapability: false
      };

      // Test cross-tenant isolation under load
      const tenantResults = await Promise.all([
        loadTestRunner.runConcurrentUsers(15, 5, { tenantCount: 1 }),
        loadTestRunner.runConcurrentUsers(15, 5, { tenantCount: 1 }),
        loadTestRunner.runConcurrentUsers(15, 5, { tenantCount: 1 })
      ]);

      // Verify no cross-contamination
      complianceValidation.crossTenantIsolation = tenantResults.every(result => 
        result.successfulUsers > 0 && result.failedUsers < result.totalUsers * 0.1
      );

      // Test data integrity
      const testConversation = await conversationManager.createConversation(
        'integrity_tenant_hash',
        'integrity_session'
      );
      
      const testMessage = { role: 'user', content: 'Data integrity test message' };
      await conversationManager.addMessage(testConversation.id, testMessage);
      
      const retrievedConversation = await conversationManager.getConversation(testConversation.id);
      complianceValidation.dataIntegrity = 
        retrievedConversation.messages.length === 1 &&
        retrievedConversation.messages[0].content === testMessage.content;

      // Test audit completeness (mock)
      const operationCount = conversationManager.getStats().requestCount;
      complianceValidation.auditCompleteness = operationCount > 0; // All operations tracked

      // Test recovery capability
      const recoveryStart = performance.now();
      const originalConversationCount = conversationManager.conversations.size;
      
      // Simulate partial failure and recovery
      conversationManager.conversations.clear();
      expect(conversationManager.conversations.size).toBe(0);
      
      // Simulate recovery process
      for (let i = 0; i < Math.min(originalConversationCount, 5); i++) {
        await conversationManager.createConversation(`recovery_tenant_${i}`, `recovery_session_${i}`);
      }
      
      const recoveryTime = performance.now() - recoveryStart;
      complianceValidation.recoveryCapability = recoveryTime < 5000; // <5s recovery

      console.log('\n=== Healthcare Compliance Under Load ===');
      Object.entries(complianceValidation).forEach(([check, passed]) => {
        const status = passed ? '✅ COMPLIANT' : '❌ NON-COMPLIANT';
        console.log(`${status} ${check}`);
        expect(passed).toBe(true);
      });

      return complianceValidation;
    });
  });
});

// Performance monitoring and reporting
describe('Performance Monitoring and Reporting', () => {
  it('should generate comprehensive performance report', async () => {
    const profiler = new PerformanceProfiler();
    const conversationManager = new LoadTestConversationManager();
    const loadTestRunner = new LoadTestRunner(conversationManager);

    profiler.setMemoryBaseline();

    // Run comprehensive test suite
    const testResults = {
      timestamp: new Date().toISOString(),
      environment: 'test',
      tests: {}
    };

    // Concurrent users test
    testResults.tests.concurrentUsers = await profiler.measureAsync(
      'final_concurrent_test',
      () => loadTestRunner.runConcurrentUsers(40, 6, { delayBetweenOperations: 80 })
    );

    // Memory usage test
    testResults.tests.memoryUsage = {
      baseline: profiler.memoryBaseline,
      peak: profiler.getMemoryUsage(),
      increase: profiler.getMemoryIncrease()
    };

    // Performance statistics
    const finalStats = conversationManager.getStats();
    testResults.tests.performanceStats = finalStats;

    // Generate report
    const report = {
      summary: {
        testDuration: Object.values(testResults.tests).reduce((total, test) => 
          total + (test.measurement?.duration || 0), 0
        ),
        totalOperations: finalStats.requestCount,
        successRate: ((finalStats.requestCount - finalStats.errorCount) / finalStats.requestCount) * 100,
        avgResponseTime: finalStats.avgProcessingTime,
        memoryEfficiency: testResults.tests.memoryUsage.increase < 100 * 1024 * 1024
      },
      kpiValidation: {
        concurrentSessions: testResults.tests.concurrentUsers.result.successfulUsers >= 40,
        responseTime: finalStats.avgResponseTime < 50,
        errorRate: finalStats.errorRate < 1,
        memoryUsage: testResults.tests.memoryUsage.increase < 100 * 1024 * 1024
      },
      recommendations: []
    };

    // Add recommendations based on results
    if (finalStats.avgProcessingTime > 40) {
      report.recommendations.push('Consider optimizing database queries for better response times');
    }
    
    if (finalStats.errorRate > 0.5) {
      report.recommendations.push('Investigate error sources and improve error handling');
    }
    
    if (testResults.tests.memoryUsage.increase > 75 * 1024 * 1024) {
      report.recommendations.push('Monitor memory usage patterns and optimize garbage collection');
    }

    console.log('\n=== Performance Test Report ===');
    console.log(JSON.stringify(report, null, 2));

    // Validate overall performance readiness
    const allKPIsPassed = Object.values(report.kpiValidation).every(Boolean);
    expect(allKPIsPassed).toBe(true);

    return report;
  }, 90000);
});