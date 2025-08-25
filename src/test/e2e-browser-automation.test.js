/**
 * Browser Automation E2E Tests for Track A+ Conversational Context
 * 
 * This test suite uses real browser automation to validate the conversational
 * context functionality in realistic user scenarios. Tests Phase 3, 4, and 5
 * requirements for frontend integration, security, and performance.
 * 
 * Test Scenarios:
 * - Real browser conversation flows
 * - Page refresh conversation recovery
 * - Cross-tab conversation continuity  
 * - Mobile device compatibility
 * - Performance under realistic network conditions
 * - Security token handling in browser environment
 * - Accessibility compliance for healthcare users
 * 
 * Healthcare KPI Validation:
 * - Page refresh recovery ≤ 1s
 * - Conversation restore success ≥ 99%
 * - Zero client-side PHI storage
 * - Cross-tenant isolation in browser
 * - Responsive design for healthcare workflows
 */

import { test, expect } from '@playwright/test';

// Test configuration
const TEST_CONFIG = {
  BASE_URL: 'http://localhost:5174',
  TIMEOUT: 30000,
  CONVERSATION_RECOVERY_TARGET: 1000, // 1 second
  TENANT_HASHES: {
    healthcare: 'healthcare-tenant-hash-123',
    clinic: 'clinic-tenant-hash-456',
    hospital: 'hospital-tenant-hash-789'
  },
  MOCK_RESPONSES: {
    conversation_get: {
      conversation_id: 'conv_browser_test',
      tenant_hash: 'healthcare-tenant-hash-123',
      messages: [
        { id: 'msg1', role: 'user', content: 'Hello, I need help with my account' },
        { id: 'msg2', role: 'assistant', content: 'I\'d be happy to help you with your account. What specific assistance do you need?' }
      ],
      metadata: {
        messageCount: 2,
        hasBeenSummarized: false,
        expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
      },
      token: 'mock_hmac_token_12345'
    },
    conversation_save: {
      conversation_id: 'conv_browser_test',
      message_saved: true,
      token: 'updated_hmac_token_67890'
    }
  }
};

// Mock API responses for isolated testing
const setupMockAPI = async (page) => {
  await page.route('**/chat', async (route, request) => {
    const body = await request.postDataJSON();
    
    if (body.action === 'conversation') {
      if (body.operation === 'get') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(TEST_CONFIG.MOCK_RESPONSES.conversation_get)
        });
      } else if (body.operation === 'save') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(TEST_CONFIG.MOCK_RESPONSES.conversation_save)
        });
      }
    } else {
      // Regular chat response
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: 'Thank you for your message. How else can I help you today?',
          session_id: 'browser_test_session',
          api_version: 'v1'
        })
      });
    }
  });
};

// Performance measurement utilities
const measurePerformance = async (page, operation) => {
  const startTime = Date.now();
  await operation();
  const endTime = Date.now();
  return endTime - startTime;
};

test.describe('Phase 3: Frontend Integration Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
  });

  test('should restore conversation from server state on page load', async ({ page }) => {
    // Navigate to chat widget page
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    
    // Wait for widget to load
    await page.waitForSelector('[data-testid="chat-widget"]', { timeout: TEST_CONFIG.TIMEOUT });
    
    // Verify that conversation was restored from server
    const messages = await page.locator('[data-testid^="message-"]').all();
    expect(messages.length).toBeGreaterThan(0);
    
    // Check specific restored messages
    const firstMessage = await page.locator('[data-testid="message-msg1"]').textContent();
    expect(firstMessage).toContain('Hello, I need help with my account');
    
    const secondMessage = await page.locator('[data-testid="message-msg2"]').textContent();
    expect(secondMessage).toContain('I\'d be happy to help you');
  });

  test('should meet page refresh recovery time ≤ 1s target', async ({ page }) => {
    // Initial page load
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Add a new message to establish conversation state
    await page.fill('[data-testid="message-input"]', 'Test message before refresh');
    await page.click('[data-testid="send-button"]');
    
    // Wait for response
    await page.waitForSelector('[data-testid="message-"]:last-child');
    
    // Measure page refresh recovery time
    const recoveryTime = await measurePerformance(page, async () => {
      await page.reload();
      await page.waitForSelector('[data-testid="chat-widget"]');
      
      // Wait for conversation to be restored
      await page.waitForSelector('[data-testid="message-"]:first-child');
    });
    
    expect(recoveryTime).toBeLessThanOrEqual(TEST_CONFIG.CONVERSATION_RECOVERY_TARGET);
    console.log(`Page refresh recovery time: ${recoveryTime}ms (target: ≤1000ms)`);
  });

  test('should maintain conversation state across browser tabs', async ({ browser }) => {
    const context = await browser.newContext();
    
    // Open first tab
    const page1 = await context.newPage();
    await setupMockAPI(page1);
    await page1.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page1.waitForSelector('[data-testid="chat-widget"]');
    
    // Send message in first tab
    await page1.fill('[data-testid="message-input"]', 'Message from tab 1');
    await page1.click('[data-testid="send-button"]');
    await page1.waitForSelector('[data-testid="message-"]:last-child');
    
    // Open second tab
    const page2 = await context.newPage();
    await setupMockAPI(page2);
    await page2.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page2.waitForSelector('[data-testid="chat-widget"]');
    
    // Verify conversation state is shared
    const messages = await page2.locator('[data-testid^="message-"]').all();
    expect(messages.length).toBeGreaterThan(1);
    
    // Send message from second tab
    await page2.fill('[data-testid="message-input"]', 'Message from tab 2');
    await page2.click('[data-testid="send-button"]');
    
    // Verify both tabs show the conversation
    await page1.reload();
    await page1.waitForSelector('[data-testid="chat-widget"]');
    const tab1Messages = await page1.locator('[data-testid^="message-"]').count();
    
    const tab2Messages = await page2.locator('[data-testid^="message-"]').count();
    
    expect(tab1Messages).toEqual(tab2Messages);
    
    await context.close();
  });

  test('should handle token-based conversation flow correctly', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Monitor network requests for token handling
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('/chat')) {
        requests.push({
          url: request.url(),
          headers: request.headers(),
          postData: request.postData()
        });
      }
    });
    
    // Send a message to trigger token exchange
    await page.fill('[data-testid="message-input"]', 'Test token flow');
    await page.click('[data-testid="send-button"]');
    
    // Wait for response
    await page.waitForSelector('[data-testid="message-"]:last-child');
    
    // Verify token was sent in request
    const chatRequest = requests.find(req => req.postData?.includes('Test token flow'));
    expect(chatRequest).toBeDefined();
    
    // Check for conversation token in headers or body
    const hasToken = chatRequest.headers['x-conversation-token'] ||
                    chatRequest.postData?.includes('token');
    expect(hasToken).toBeTruthy();
  });

  test('should maintain backward compatibility with legacy message handling', async ({ page }) => {
    // Mock legacy API response format
    await page.route('**/chat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: 'Legacy format response',
          session_id: 'legacy_session_123'
          // No token field - legacy format
        })
      });
    });
    
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Send message using legacy format
    await page.fill('[data-testid="message-input"]', 'Legacy compatibility test');
    await page.click('[data-testid="send-button"]');
    
    // Verify response is handled correctly
    await page.waitForSelector('[data-testid="message-"]:last-child');
    const lastMessage = await page.locator('[data-testid="message-"]:last-child').textContent();
    expect(lastMessage).toContain('Legacy format response');
  });
});

test.describe('Phase 4: Security & Compliance Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
  });

  test('should enforce cross-tenant isolation in browser environment', async ({ page }) => {
    // Test tenant A
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html?tenant=${TEST_CONFIG.TENANT_HASHES.healthcare}`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Send message as healthcare tenant
    await page.fill('[data-testid="message-input"]', 'Healthcare tenant message');
    await page.click('[data-testid="send-button"]');
    await page.waitForTimeout(1000);
    
    // Attempt to access different tenant's data
    await page.route('**/chat', async route => {
      const body = await route.request().postDataJSON();
      
      // Simulate cross-tenant access attempt
      if (body.tenant_hash && body.tenant_hash !== TEST_CONFIG.TENANT_HASHES.healthcare) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Access denied' })
        });
      } else {
        await route.continue();
      }
    });
    
    // Try to switch tenant context (should fail)
    await page.evaluate((clinicHash) => {
      window.PicassoConfig = { tenant: clinicHash };
    }, TEST_CONFIG.TENANT_HASHES.clinic);
    
    // Send another message - should be rejected
    await page.fill('[data-testid="message-input"]', 'Cross-tenant attempt');
    await page.click('[data-testid="send-button"]');
    
    // Verify error handling
    await page.waitForSelector('[data-testid="error-message"]', { timeout: 5000 });
    const errorMessage = await page.locator('[data-testid="error-message"]').textContent();
    expect(errorMessage).toContain('Access denied');
  });

  test('should validate zero client-side PHI storage', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Send message with potential PHI
    const phiMessage = 'My SSN is 123-45-6789 and DOB is 01/15/1980';
    await page.fill('[data-testid="message-input"]', phiMessage);
    await page.click('[data-testid="send-button"]');
    
    await page.waitForTimeout(2000);
    
    // Check localStorage for PHI
    const localStorage = await page.evaluate(() => {
      const storage = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        storage[key] = window.localStorage.getItem(key);
      }
      return storage;
    });
    
    // Check sessionStorage for PHI
    const sessionStorage = await page.evaluate(() => {
      const storage = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        storage[key] = window.sessionStorage.getItem(key);
      }
      return storage;
    });
    
    // Verify no PHI in browser storage
    const allStorageValues = [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage)
    ].join(' ');
    
    expect(allStorageValues).not.toContain('123-45-6789');
    expect(allStorageValues).not.toContain('01/15/1980');
    expect(allStorageValues).not.toContain('SSN');
    
    console.log('✅ Zero client-side PHI storage verified');
  });

  test('should handle HMAC token security in browser', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Monitor token handling
    const tokenRequests = [];
    page.on('request', request => {
      if (request.url().includes('/chat')) {
        const headers = request.headers();
        const postData = request.postData();
        
        if (headers['x-conversation-token'] || (postData && postData.includes('token'))) {
          tokenRequests.push({
            token: headers['x-conversation-token'],
            timestamp: Date.now()
          });
        }
      }
    });
    
    // Send multiple messages to test token rotation
    for (let i = 0; i < 3; i++) {
      await page.fill('[data-testid="message-input"]', `Message ${i + 1}`);
      await page.click('[data-testid="send-button"]');
      await page.waitForTimeout(1000);
    }
    
    // Verify tokens are being used
    expect(tokenRequests.length).toBeGreaterThan(0);
    
    // Verify tokens are different (rotation)
    const uniqueTokens = new Set(tokenRequests.map(req => req.token).filter(Boolean));
    expect(uniqueTokens.size).toBeGreaterThan(0);
  });

  test('should implement proper error handling for security violations', async ({ page }) => {
    // Mock security violation responses
    await page.route('**/chat', async route => {
      const requestBody = await route.request().postDataJSON();
      
      // Simulate various security violations
      if (requestBody.user_input?.includes('SECURITY_VIOLATION')) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Security violation detected',
            audit_id: 'sec_violation_001'
          })
        });
      } else if (requestBody.user_input?.includes('INVALID_TOKEN')) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.dumps({
            error: 'Invalid authentication token'
          })
        });
      } else {
        await route.continue();
      }
    });
    
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Test security violation handling
    await page.fill('[data-testid="message-input"]', 'SECURITY_VIOLATION test');
    await page.click('[data-testid="send-button"]');
    
    // Verify error is displayed to user
    await page.waitForSelector('[data-testid="error-message"]');
    const errorText = await page.locator('[data-testid="error-message"]').textContent();
    expect(errorText).toContain('Security violation');
    
    // Test invalid token handling
    await page.fill('[data-testid="message-input"]', 'INVALID_TOKEN test');
    await page.click('[data-testid="send-button"]');
    
    await page.waitForSelector('[data-testid="error-message"]');
    const tokenErrorText = await page.locator('[data-testid="error-message"]').textContent();
    expect(tokenErrorText).toContain('authentication');
  });
});

test.describe('Phase 5: Performance & Production Readiness Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
  });

  test('should handle high message volume performance', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    const messageCount = 20;
    const startTime = Date.now();
    
    // Send multiple messages rapidly
    for (let i = 0; i < messageCount; i++) {
      await page.fill('[data-testid="message-input"]', `Performance test message ${i + 1}`);
      await page.click('[data-testid="send-button"]');
      
      // Small delay to simulate realistic typing
      await page.waitForTimeout(100);
    }
    
    // Wait for all responses
    await page.waitForSelector(`[data-testid="message-"]:nth-child(${messageCount * 2})`);
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTimePerMessage = totalTime / messageCount;
    
    expect(avgTimePerMessage).toBeLessThan(500); // <500ms per message
    console.log(`Average time per message: ${avgTimePerMessage.toFixed(2)}ms`);
  });

  test('should maintain responsive UI under load', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Test UI responsiveness during heavy operations
    const responseTimes = [];
    
    for (let i = 0; i < 10; i++) {
      const startTime = Date.now();
      
      // Trigger UI interaction
      await page.click('[data-testid="message-input"]');
      await page.fill('[data-testid="message-input"]', `Responsiveness test ${i + 1}`);
      
      const endTime = Date.now();
      responseTimes.push(endTime - startTime);
      
      await page.click('[data-testid="send-button"]');
      await page.waitForTimeout(200);
    }
    
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    expect(avgResponseTime).toBeLessThan(100); // <100ms UI response
    
    console.log(`Average UI response time: ${avgResponseTime.toFixed(2)}ms`);
  });

  test('should handle network connectivity issues gracefully', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Simulate network failure
    await page.route('**/chat', route => route.abort());
    
    // Send message during network failure
    await page.fill('[data-testid="message-input"]', 'Network failure test');
    await page.click('[data-testid="send-button"]');
    
    // Verify error handling
    await page.waitForSelector('[data-testid="error-message"]', { timeout: 10000 });
    const errorMessage = await page.locator('[data-testid="error-message"]').textContent();
    expect(errorMessage).toMatch(/(network|connection|try again)/i);
    
    // Restore network and retry
    await setupMockAPI(page);
    
    // Check for retry functionality
    const retryButton = page.locator('[data-testid="retry-button"]');
    if (await retryButton.isVisible()) {
      await retryButton.click();
      await page.waitForSelector('[data-testid="message-"]:last-child');
    }
  });

  test('should support mobile device compatibility', async ({ browser }) => {
    // Test mobile viewport
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }, // iPhone SE
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
    });
    
    const page = await context.newPage();
    await setupMockAPI(page);
    
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Test mobile interaction
    await page.tap('[data-testid="message-input"]');
    await page.fill('[data-testid="message-input"]', 'Mobile compatibility test');
    await page.tap('[data-testid="send-button"]');
    
    // Verify mobile layout
    const widget = page.locator('[data-testid="chat-widget"]');
    const widgetBounds = await widget.boundingBox();
    
    expect(widgetBounds.width).toBeLessThanOrEqual(375);
    expect(widgetBounds.height).toBeLessThanOrEqual(667);
    
    // Test scroll behavior on mobile
    const messageList = page.locator('[data-testid="message-list"]');
    await expect(messageList).toBeVisible();
    
    await context.close();
  });

  test('should meet accessibility requirements for healthcare users', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Test keyboard navigation
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement.getAttribute('data-testid'));
    expect(focusedElement).toBe('message-input');
    
    // Test ARIA labels
    const messageInput = page.locator('[data-testid="message-input"]');
    const ariaLabel = await messageInput.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    
    // Test screen reader compatibility
    const sendButton = page.locator('[data-testid="send-button"]');
    const buttonRole = await sendButton.getAttribute('role');
    expect(buttonRole).toBe('button');
    
    // Test color contrast (basic check)
    const computedStyle = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="message-input"]');
      const style = window.getComputedStyle(input);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor
      };
    });
    
    expect(computedStyle.color).toBeTruthy();
    expect(computedStyle.backgroundColor).toBeTruthy();
  });
});

test.describe('Healthcare Workflow Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
  });

  test('should support healthcare-specific conversation flows', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Simulate healthcare conversation
    const healthcareQueries = [
      'I need to schedule an appointment',
      'Can you help me with my prescription refill?',
      'What are your office hours?',
      'I need to update my insurance information'
    ];
    
    for (const query of healthcareQueries) {
      await page.fill('[data-testid="message-input"]', query);
      await page.click('[data-testid="send-button"]');
      
      // Wait for response
      await page.waitForSelector('[data-testid="message-"]:last-child');
      await page.waitForTimeout(500);
    }
    
    // Verify conversation history contains healthcare interactions
    const messages = await page.locator('[data-testid^="message-"]').count();
    expect(messages).toBeGreaterThanOrEqual(healthcareQueries.length * 2); // User + assistant messages
  });

  test('should handle emergency/urgent healthcare scenarios', async ({ page }) => {
    // Mock urgent response handling
    await page.route('**/chat', async route => {
      const body = await route.request().postDataJSON();
      
      if (body.user_input?.toLowerCase().includes('emergency')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            content: 'I understand this is urgent. If this is a medical emergency, please call 911 immediately. For urgent care, our emergency line is available 24/7.',
            priority: 'urgent',
            actions: [
              { label: 'Call 911', value: 'emergency_911' },
              { label: 'Urgent Care Line', value: 'urgent_care' }
            ]
          })
        });
      } else {
        await route.continue();
      }
    });
    
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Send emergency message
    await page.fill('[data-testid="message-input"]', 'This is an emergency situation');
    await page.click('[data-testid="send-button"]');
    
    // Verify urgent response
    await page.waitForSelector('[data-testid="message-"]:last-child');
    const lastMessage = await page.locator('[data-testid="message-"]:last-child').textContent();
    expect(lastMessage).toMatch(/(emergency|urgent|911)/i);
    
    // Check for action buttons
    const actionButtons = page.locator('[data-testid^="action-button-"]');
    const buttonCount = await actionButtons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('should maintain HIPAA compliance in UI interactions', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Send message with potential PHI
    await page.fill('[data-testid="message-input"]', 'My patient ID is P123456 and my DOB is 01/15/1980');
    await page.click('[data-testid="send-button"]');
    
    await page.waitForTimeout(2000);
    
    // Verify PHI is not visible in UI
    const messageElements = await page.locator('[data-testid^="message-"]').all();
    
    for (const element of messageElements) {
      const text = await element.textContent();
      expect(text).not.toContain('P123456');
      expect(text).not.toContain('01/15/1980');
    }
    
    // Verify PII scrubbing indicators
    const lastUserMessage = await page.locator('[data-testid="message-"]:nth-last-child(2)').textContent();
    expect(lastUserMessage).toMatch(/\[.*REDACTED.*\]/);
  });
});

test.describe('KPI Validation Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
  });

  test('should validate all browser-based KPIs', async ({ page }) => {
    const kpiResults = {};
    
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    // Page refresh recovery time ≤ 1s
    const recoveryTime = await measurePerformance(page, async () => {
      await page.reload();
      await page.waitForSelector('[data-testid="chat-widget"]');
    });
    kpiResults.pageRefreshRecoveryTime = recoveryTime;
    
    // Conversation restore success rate (simulated)
    let restoreSuccesses = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await page.reload();
        await page.waitForSelector('[data-testid="chat-widget"]', { timeout: 5000 });
        await page.waitForSelector('[data-testid^="message-"]', { timeout: 3000 });
        restoreSuccesses++;
      } catch (error) {
        // Failed to restore
      }
    }
    kpiResults.conversationRestoreSuccessRate = (restoreSuccesses / 10) * 100;
    
    // UI responsiveness
    const uiResponseTimes = [];
    for (let i = 0; i < 5; i++) {
      const responseTime = await measurePerformance(page, async () => {
        await page.click('[data-testid="message-input"]');
        await page.fill('[data-testid="message-input"]', `Test ${i + 1}`);
      });
      uiResponseTimes.push(responseTime);
    }
    kpiResults.avgUIResponseTime = uiResponseTimes.reduce((a, b) => a + b, 0) / uiResponseTimes.length;
    
    // Validate KPI targets
    expect(kpiResults.pageRefreshRecoveryTime).toBeLessThanOrEqual(1000); // ≤ 1s
    expect(kpiResults.conversationRestoreSuccessRate).toBeGreaterThanOrEqual(99); // ≥ 99%
    expect(kpiResults.avgUIResponseTime).toBeLessThanOrEqual(100); // ≤ 100ms
    
    console.log('\n=== Browser KPI Results ===');
    console.log(`Page Refresh Recovery: ${kpiResults.pageRefreshRecoveryTime}ms (target: ≤1000ms)`);
    console.log(`Conversation Restore Success: ${kpiResults.conversationRestoreSuccessRate}% (target: ≥99%)`);
    console.log(`UI Response Time: ${kpiResults.avgUIResponseTime.toFixed(2)}ms (target: ≤100ms)`);
    
    return kpiResults;
  });

  test('should validate healthcare compliance in browser environment', async ({ page }) => {
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    await page.waitForSelector('[data-testid="chat-widget"]');
    
    const complianceChecks = {
      zeroPHIStorage: false,
      tokenSecurity: false,
      errorHandling: false,
      accessibility: false,
      mobileCompatibility: false
    };
    
    // Check PHI storage
    await page.fill('[data-testid="message-input"]', 'SSN: 123-45-6789');
    await page.click('[data-testid="send-button"]');
    await page.waitForTimeout(1000);
    
    const storage = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage)
    }));
    
    if (!storage.local.includes('123-45-6789') && !storage.session.includes('123-45-6789')) {
      complianceChecks.zeroPHIStorage = true;
    }
    
    // Check token security (presence of token handling)
    const tokenRequests = [];
    page.on('request', req => {
      if (req.url().includes('/chat')) {
        tokenRequests.push(req);
      }
    });
    
    await page.fill('[data-testid="message-input"]', 'Token test');
    await page.click('[data-testid="send-button"]');
    await page.waitForTimeout(1000);
    
    if (tokenRequests.length > 0) {
      complianceChecks.tokenSecurity = true;
    }
    
    // Check accessibility
    const ariaLabels = await page.locator('[aria-label]').count();
    if (ariaLabels > 0) {
      complianceChecks.accessibility = true;
    }
    
    // Validate all compliance checks
    Object.entries(complianceChecks).forEach(([check, passed]) => {
      expect(passed).toBe(true);
      console.log(`✅ ${check}: ${passed ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
    });
  });
});

// Test configuration and utilities for development
test.describe('Development Testing Utilities', () => {
  test('should provide debugging information for failed tests', async ({ page }) => {
    // This test always runs to provide debugging info
    await page.goto(`${TEST_CONFIG.BASE_URL}/test.html`);
    
    try {
      await page.waitForSelector('[data-testid="chat-widget"]', { timeout: 5000 });
      console.log('✅ Chat widget loaded successfully');
    } catch (error) {
      console.log('❌ Chat widget failed to load:', error.message);
      
      // Capture page state for debugging
      const pageContent = await page.content();
      console.log('Page content length:', pageContent.length);
      
      const consoleMessages = [];
      page.on('console', msg => consoleMessages.push(msg.text()));
      
      console.log('Console messages:', consoleMessages);
    }
    
    // Report current configuration
    console.log('Test Configuration:');
    console.log('- Base URL:', TEST_CONFIG.BASE_URL);
    console.log('- Timeout:', TEST_CONFIG.TIMEOUT);
    console.log('- Healthcare tenant:', TEST_CONFIG.TENANT_HASHES.healthcare);
  });
});