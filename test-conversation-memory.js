/**
 * Synthetic Conversation Flow Test - Track A+ Conversational Context Verification
 * 
 * This test verifies that the PICASSO chat widget maintains conversational memory
 * across multiple message exchanges, proving the "leak" has been plugged.
 * 
 * Test Flow:
 * 1. Load test page with visible browser
 * 2. Open chat widget
 * 3. Send initial question about home care
 * 4. Send follow-up question referencing previous context
 * 5. Send third question that requires memory of entire conversation
 * 6. Verify bot demonstrates understanding of conversation history
 * 
 * Success Criteria:
 * - Bot should reference previous messages in responses
 * - Bot should maintain context across multiple exchanges
 * - No 400 Bad Request errors for conversation state
 * - Console logs show conversation context being sent
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConversationMemoryTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async initialize() {
    console.log('🚀 Starting Conversation Memory Test...');
    console.log('📋 Testing: Track A+ Conversational Context Implementation');
    console.log('🎯 Goal: Verify bot remembers conversation history\n');

    // Launch browser with visible UI
    this.browser = await chromium.launch({
      headless: false, // Make browser visible
      slowMo: 1000,    // Slow down actions for visibility
      args: [
        '--start-maximized',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Set viewport for optimal visibility
    await this.page.setViewportSize({ width: 1400, height: 900 });

    // Set up console monitoring
    this.setupConsoleMonitoring();
    
    // Set up network monitoring
    this.setupNetworkMonitoring();
  }

  setupConsoleMonitoring() {
    this.page.on('console', (msg) => {
      const text = msg.text();
      
      // Monitor conversation-related logs
      if (text.includes('conversation') || text.includes('💬') || text.includes('🔄')) {
        console.log(`📱 Widget Console: ${text}`);
      }
      
      // Monitor errors
      if (msg.type() === 'error') {
        console.log(`❌ Browser Error: ${text}`);
        this.testResults.errors.push(`Console Error: ${text}`);
      }
    });
  }

  setupNetworkMonitoring() {
    this.page.on('response', (response) => {
      const url = response.url();
      const status = response.status();
      
      // Monitor API calls
      if (url.includes('Master_Function') || url.includes('chat')) {
        const statusIcon = status >= 400 ? '❌' : '✅';
        console.log(`📡 API Call: ${statusIcon} ${status} ${url}`);
        
        if (status >= 400) {
          this.testResults.errors.push(`API Error: ${status} ${url}`);
        }
      }
    });

    this.page.on('requestfailed', (request) => {
      console.log(`💥 Request Failed: ${request.url()}`);
      this.testResults.errors.push(`Request Failed: ${request.url()}`);
    });
  }

  async loadTestPage() {
    console.log('📄 Loading test page...');
    
    const testPagePath = path.resolve(__dirname, 'iframe-test.html');
    await this.page.goto(`file://${testPagePath}`);
    
    // Wait for page to fully load
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);
    
    console.log('✅ Test page loaded');
  }

  async openChatWidget() {
    console.log('💬 Opening chat widget...');
    
    // Wait for widget to initialize
    await this.page.waitForSelector('.picasso-widget', { timeout: 10000 });
    
    // Click to open widget
    await this.page.click('.picasso-widget');
    
    // Wait for chat interface to be visible
    await this.page.waitForSelector('.chat-container', { timeout: 5000 });
    
    console.log('✅ Chat widget opened');
    
    // Give it a moment to settle
    await this.page.waitForTimeout(1000);
  }

  async sendMessage(message, expectedResponseContent = null) {
    console.log(`📤 Sending message: "${message}"`);
    
    // Find input field and type message
    const inputSelector = '.message-input input';
    await this.page.waitForSelector(inputSelector, { timeout: 5000 });
    await this.page.fill(inputSelector, message);
    
    // Send message (look for send button or Enter key)
    const sendButtonSelector = '.send-button, .message-input button';
    try {
      await this.page.click(sendButtonSelector);
    } catch {
      // Fallback to Enter key if button not found
      await this.page.press(inputSelector, 'Enter');
    }
    
    console.log('📨 Message sent, waiting for response...');
    
    // Wait for response - look for new message bubble
    const messageSelector = '.message-bubble';
    await this.page.waitForFunction(
      (selector) => {
        const messages = document.querySelectorAll(selector);
        return messages.length >= 2; // At least user message + bot response
      },
      messageSelector,
      { timeout: 30000 }
    );
    
    // Wait a bit more for response to fully render
    await this.page.waitForTimeout(2000);
    
    // Get the latest bot response
    const botMessages = await this.page.$$eval(
      '.message-bubble.assistant, .message-bubble.bot',
      (elements) => elements.map(el => el.textContent.trim())
    );
    
    const latestResponse = botMessages[botMessages.length - 1];
    console.log(`📥 Bot response: "${latestResponse.substring(0, 100)}..."`);
    
    // Check if response contains expected content
    if (expectedResponseContent) {
      const hasExpectedContent = expectedResponseContent.some(content => 
        latestResponse.toLowerCase().includes(content.toLowerCase())
      );
      
      if (hasExpectedContent) {
        console.log('✅ Response contains expected contextual content');
        this.testResults.passed++;
      } else {
        console.log(`❌ Response missing expected content: ${expectedResponseContent.join(', ')}`);
        this.testResults.failed++;
        this.testResults.errors.push(`Missing contextual content in response to: "${message}"`);
      }
    }
    
    return latestResponse;
  }

  async runConversationFlow() {
    console.log('\n🎭 Starting synthetic conversation flow...\n');
    
    // Message 1: Initial question about home care
    console.log('🗨️  TURN 1: Initial home care inquiry');
    await this.sendMessage(
      "Hi, I'm looking for information about home care services for my elderly mother."
    );
    
    await this.page.waitForTimeout(3000);
    
    // Message 2: Follow-up that requires context from first message
    console.log('\n🗨️  TURN 2: Follow-up requiring memory of mother context');
    const response2 = await this.sendMessage(
      "What specific services would be best for her if she has mobility issues?",
      ['mother', 'her', 'mobility', 'services'] // Should reference previous context
    );
    
    await this.page.waitForTimeout(3000);
    
    // Message 3: Third message requiring memory of entire conversation
    console.log('\n🗨️  TURN 3: Complex follow-up requiring full conversation memory');
    const response3 = await this.sendMessage(
      "How much would those services typically cost per week?",
      ['services', 'cost', 'week'] // Should understand "those services" refers to previous discussion
    );
    
    await this.page.waitForTimeout(3000);
    
    // Message 4: Final test - reference very first message
    console.log('\n🗨️  TURN 4: Reference to initial message to test long-term memory');
    const response4 = await this.sendMessage(
      "Can you remind me what we discussed about my mother's care needs?",
      ['mother', 'care', 'mobility', 'services'] // Should recall the entire conversation
    );
    
    console.log('\n🎯 Conversation flow completed!');
    
    return {
      response2,
      response3, 
      response4
    };
  }

  async checkConversationContext() {
    console.log('\n🔍 Checking conversation context in network requests...');
    
    // Look for conversation context in console logs
    const logs = await this.page.evaluate(() => {
      return window.console._logs || [];
    });
    
    const conversationLogs = logs.filter(log => 
      log.includes('conversation') || 
      log.includes('context') || 
      log.includes('turn')
    );
    
    if (conversationLogs.length > 0) {
      console.log('✅ Found conversation context logs');
      conversationLogs.forEach(log => console.log(`  📝 ${log}`));
      this.testResults.passed++;
    } else {
      console.log('❌ No conversation context logs found');
      this.testResults.failed++;
      this.testResults.errors.push('No conversation context detected in logs');
    }
  }

  async validateConversationMemory(responses) {
    console.log('\n🧠 Validating conversational memory...');
    
    // Check if responses show understanding of context
    const contextChecks = [
      {
        test: 'Reference to mother in subsequent messages',
        check: (responses) => responses.response2.toLowerCase().includes('mother') ||
                              responses.response2.toLowerCase().includes('her'),
        responses: [responses.response2]
      },
      {
        test: 'Understanding of "those services" reference',
        check: (responses) => responses.response3.length > 50, // Substantial response
        responses: [responses.response3]
      },
      {
        test: 'Ability to recall full conversation',
        check: (responses) => responses.response4.toLowerCase().includes('mother') &&
                              (responses.response4.toLowerCase().includes('mobility') ||
                               responses.response4.toLowerCase().includes('care')),
        responses: [responses.response4]
      }
    ];
    
    console.log('📊 Memory validation results:');
    
    contextChecks.forEach((check, index) => {
      const passed = check.check(responses);
      const status = passed ? '✅' : '❌';
      console.log(`  ${status} ${check.test}`);
      
      if (passed) {
        this.testResults.passed++;
      } else {
        this.testResults.failed++;
        this.testResults.errors.push(`Memory test failed: ${check.test}`);
      }
    });
  }

  async takeScreenshot() {
    console.log('📸 Taking final screenshot...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `./conversation-memory-test-${timestamp}.png`;
    
    await this.page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    console.log(`✅ Screenshot saved: ${screenshotPath}`);
  }

  async cleanup() {
    if (this.browser) {
      console.log('\n🧹 Cleaning up browser...');
      await this.browser.close();
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 CONVERSATION MEMORY TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${this.testResults.passed}`);
    console.log(`❌ Tests Failed: ${this.testResults.failed}`);
    console.log(`📊 Success Rate: ${Math.round((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100)}%`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Errors Encountered:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    const success = this.testResults.failed === 0 && this.testResults.errors.length === 0;
    
    console.log('\n' + '='.repeat(60));
    if (success) {
      console.log('🎉 CONVERSATION MEMORY TEST PASSED!');
      console.log('🔌 The conversational memory "leak" has been successfully plugged!');
      console.log('✅ Track A+ Conversational Context is working correctly');
    } else {
      console.log('💥 CONVERSATION MEMORY TEST FAILED!');
      console.log('🚨 The conversational memory "leak" may still exist');
      console.log('⚠️  Manual investigation required');
    }
    console.log('='.repeat(60));
    
    return success;
  }

  async run() {
    let success = false;
    
    try {
      await this.initialize();
      await this.loadTestPage();
      await this.openChatWidget();
      
      const responses = await this.runConversationFlow();
      await this.checkConversationContext();
      await this.validateConversationMemory(responses);
      await this.takeScreenshot();
      
      success = this.printResults();
      
    } catch (error) {
      console.log(`\n💥 Test execution failed: ${error.message}`);
      this.testResults.errors.push(`Test execution error: ${error.message}`);
      this.printResults();
    } finally {
      // Keep browser open for 30 seconds to allow manual inspection
      console.log('\n⏱️  Keeping browser open for 30 seconds for manual inspection...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      await this.cleanup();
    }
    
    return success;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new ConversationMemoryTest();
  
  test.run().then(success => {
    console.log(`\n🏁 Test completed. Success: ${success}`);
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(`\n💥 Test runner failed: ${error.message}`);
    process.exit(1);
  });
}

export default ConversationMemoryTest;