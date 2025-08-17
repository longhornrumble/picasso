/**
 * Picasso Widget Memory Test Automation
 * 
 * This script provides utilities for automating interactions with the Picasso widget
 * for end-to-end conversation memory testing.
 */

// Widget automation utilities
class WidgetAutomation {
    constructor() {
        this.messageQueue = [];
        this.responseWaiters = [];
        this.isInitialized = false;
        this.iframe = null;
        this.setupMessageListener();
    }

    /**
     * Wait for the widget to be loaded and accessible
     */
    async waitForWidget(timeout = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (window.PicassoWidget && window.PicassoWidget.isLoaded && window.PicassoWidget.isLoaded()) {
                // Find the iframe
                this.iframe = document.getElementById('picasso-widget-iframe');
                if (this.iframe && this.iframe.contentWindow) {
                    this.isInitialized = true;
                    console.log('✅ Widget automation ready');
                    return true;
                }
            }
            await this.sleep(100);
        }
        
        throw new Error('Widget failed to load within timeout');
    }

    /**
     * Setup message listener to intercept widget responses
     */
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            // Listen for messages from the widget iframe
            if (event.data && event.data.type === 'PICASSO_EVENT') {
                if (event.data.event === 'MESSAGE_RECEIVED') {
                    this.handleMessageReceived(event.data.payload);
                }
            }
        });
    }

    /**
     * Handle received messages from the widget
     */
    handleMessageReceived(payload) {
        console.log('📨 Received message from widget:', payload);
        
        // Notify any waiting promises
        this.responseWaiters.forEach(waiter => {
            if (waiter.callback) {
                waiter.callback(payload);
            }
        });
        this.responseWaiters = [];
    }

    /**
     * Open the widget programmatically
     */
    async openWidget() {
        if (!this.isInitialized) {
            await this.waitForWidget();
        }
        
        console.log('🔓 Opening widget...');
        window.PicassoWidget.open();
        
        // Wait for widget to open
        await this.sleep(1500);
        
        // Verify widget is open
        const isOpen = window.PicassoWidget.isOpen();
        console.log(`Widget is ${isOpen ? 'open' : 'closed'}`);
        
        return isOpen;
    }

    /**
     * Send a message to the widget
     */
    async sendMessage(message, waitForResponse = true) {
        if (!this.isInitialized) {
            throw new Error('Widget not initialized');
        }

        console.log(`📤 Sending message: "${message}"`);
        
        // Ensure widget is open first
        const isOpen = await this.openWidget();
        if (!isOpen) {
            throw new Error('Failed to open widget');
        }

        // Wait a moment for the widget to be fully rendered
        await this.sleep(1000);

        // Find the input field within the iframe
        try {
            const inputField = await this.waitForElement('input[type="text"], textarea, [contenteditable="true"]', 5000);
            
            if (!inputField) {
                throw new Error('Could not find input field in widget');
            }

            // Clear existing content and type new message
            inputField.focus();
            inputField.value = '';
            inputField.textContent = '';
            
            // Simulate typing
            await this.typeText(inputField, message);
            
            // Find and click send button
            const sendButton = await this.waitForElement('button[type="submit"], button:contains("Send"), [aria-label*="send"]', 2000);
            
            if (sendButton) {
                sendButton.click();
                console.log('✅ Message sent via send button');
            } else {
                // Try Enter key as fallback
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                });
                inputField.dispatchEvent(enterEvent);
                console.log('✅ Message sent via Enter key');
            }

            if (waitForResponse) {
                // Wait for response
                const response = await this.waitForResponse(15000);
                console.log(`📨 Received response: "${response}"`);
                return response;
            }

        } catch (error) {
            console.error('❌ Failed to send message:', error);
            
            // Try alternative method: postMessage to iframe
            try {
                const message_data = {
                    type: 'PICASSO_TEST_MESSAGE',
                    message: message
                };
                
                this.iframe.contentWindow.postMessage(message_data, '*');
                console.log('📤 Sent message via postMessage fallback');
                
                if (waitForResponse) {
                    return await this.waitForResponse(15000);
                }
            } catch (fallbackError) {
                throw new Error(`Failed to send message: ${error.message}`);
            }
        }
    }

    /**
     * Wait for an element to appear within the iframe
     */
    async waitForElement(selector, timeout = 5000) {
        if (!this.iframe || !this.iframe.contentDocument) {
            return null;
        }

        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                const element = this.iframe.contentDocument.querySelector(selector);
                if (element) {
                    return element;
                }
                
                // Also try searching by text content for buttons
                if (selector.includes(':contains(')) {
                    const text = selector.match(/:contains\("([^"]+)"\)/)?.[1];
                    if (text) {
                        const buttons = this.iframe.contentDocument.querySelectorAll('button');
                        for (const button of buttons) {
                            if (button.textContent.toLowerCase().includes(text.toLowerCase())) {
                                return button;
                            }
                        }
                    }
                }
            } catch (error) {
                // Cross-origin or other access issues
                console.warn('Could not access iframe content:', error.message);
            }
            
            await this.sleep(100);
        }
        
        return null;
    }

    /**
     * Type text into an element with realistic timing
     */
    async typeText(element, text) {
        element.focus();
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            // Simulate keydown, keypress, input, keyup events
            const events = [
                new KeyboardEvent('keydown', { key: char, bubbles: true }),
                new KeyboardEvent('keypress', { key: char, bubbles: true }),
                new Event('input', { bubbles: true }),
                new KeyboardEvent('keyup', { key: char, bubbles: true })
            ];
            
            // Update the element value
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.value += char;
            } else {
                element.textContent += char;
            }
            
            // Dispatch events
            events.forEach(event => element.dispatchEvent(event));
            
            // Random typing delay between 50-150ms
            await this.sleep(Math.random() * 100 + 50);
        }
    }

    /**
     * Wait for a response from the AI
     */
    async waitForResponse(timeout = 15000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timeout waiting for response'));
            }, timeout);

            // Check for new messages in the chat
            const checkForNewMessage = async () => {
                try {
                    if (this.iframe && this.iframe.contentDocument) {
                        // Look for message elements in the chat
                        const messages = this.iframe.contentDocument.querySelectorAll(
                            '.message, .chat-message, [class*="message"], [data-testid*="message"]'
                        );
                        
                        if (messages.length > 0) {
                            // Get the last message
                            const lastMessage = messages[messages.length - 1];
                            const messageText = lastMessage.textContent || lastMessage.innerText;
                            
                            // Check if it's not from the user (simple heuristic)
                            if (messageText && !lastMessage.classList.contains('user-message') && 
                                !lastMessage.querySelector('.user') && 
                                !messageText.startsWith('You:')) {
                                clearTimeout(timer);
                                resolve(messageText.trim());
                                return;
                            }
                        }
                    }
                    
                    // Continue checking
                    setTimeout(checkForNewMessage, 500);
                } catch (error) {
                    // Continue checking even if iframe access fails
                    setTimeout(checkForNewMessage, 500);
                }
            };

            checkForNewMessage();

            // Also register with the response waiter system
            this.responseWaiters.push({
                callback: (payload) => {
                    clearTimeout(timer);
                    resolve(payload.message || payload.text || 'Response received');
                }
            });
        });
    }

    /**
     * Extract messages from the chat history
     */
    async getChatHistory() {
        if (!this.iframe || !this.iframe.contentDocument) {
            return [];
        }

        try {
            const messages = this.iframe.contentDocument.querySelectorAll(
                '.message, .chat-message, [class*="message"], [data-testid*="message"]'
            );
            
            return Array.from(messages).map(msg => ({
                text: msg.textContent || msg.innerText,
                sender: msg.classList.contains('user-message') || msg.querySelector('.user') ? 'user' : 'ai',
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('Could not extract chat history:', error.message);
            return [];
        }
    }

    /**
     * Utility function for delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Close the widget
     */
    closeWidget() {
        if (window.PicassoWidget) {
            window.PicassoWidget.close();
            console.log('🔒 Widget closed');
        }
    }

    /**
     * Check if text contains expected context keywords
     */
    verifyContext(text, expectedKeywords) {
        const lowerText = text.toLowerCase();
        const foundKeywords = expectedKeywords.filter(keyword => 
            lowerText.includes(keyword.toLowerCase())
        );
        
        console.log(`🔍 Context verification: Found ${foundKeywords.length}/${expectedKeywords.length} keywords`);
        console.log(`Expected: [${expectedKeywords.join(', ')}]`);
        console.log(`Found: [${foundKeywords.join(', ')}]`);
        
        return foundKeywords.length >= Math.ceil(expectedKeywords.length * 0.8); // 80% match threshold
    }
}

// Global instance
const widgetAutomation = new WidgetAutomation();

/**
 * Main test runner function that handles the complete memory test flow
 */
async function runMemoryTest(testId, testSteps) {
    console.log(`🚀 Starting memory test: ${testId}`);
    
    try {
        // Ensure widget is ready
        await widgetAutomation.waitForWidget();
        
        // Close widget first to ensure clean state
        widgetAutomation.closeWidget();
        await widgetAutomation.sleep(1000);
        
        let allTestsPassed = true;
        
        for (let i = 0; i < testSteps.length; i++) {
            const step = testSteps[i];
            console.log(`📝 Test step ${i + 1}: "${step.message}"`);
            
            // Log the message being sent
            logMessage(testId, 'User', step.message);
            
            // Send message and wait for response
            const response = await widgetAutomation.sendMessage(step.message, true);
            
            // Log the response
            logMessage(testId, 'AI', response);
            
            // Verify context if this step expects context validation
            if (step.expectedContext && step.expectedContext.length > 0) {
                const contextValid = widgetAutomation.verifyContext(response, step.expectedContext);
                
                if (!contextValid) {
                    console.log(`❌ Context verification failed for step ${i + 1}`);
                    allTestsPassed = false;
                } else {
                    console.log(`✅ Context verification passed for step ${i + 1}`);
                }
            }
            
            // Wait between steps if specified
            if (step.delay) {
                console.log(`⏳ Waiting ${step.delay}ms before next step...`);
                await widgetAutomation.sleep(step.delay);
            } else if (i < testSteps.length - 1) {
                // Default delay between steps
                await widgetAutomation.sleep(1500);
            }
        }
        
        console.log(`🏁 Memory test ${testId} completed: ${allTestsPassed ? 'PASSED' : 'FAILED'}`);
        return allTestsPassed;
        
    } catch (error) {
        console.error(`❌ Memory test ${testId} failed:`, error);
        logMessage(testId, 'System', `ERROR: ${error.message}`);
        return false;
    }
}

/**
 * Enhanced error monitoring for conversation memory issues
 */
function setupConversationMemoryMonitoring() {
    // Monitor for specific conversation memory errors
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    console.error = function(...args) {
        originalConsoleError.apply(console, args);
        const message = args.join(' ');
        
        // Check for memory-related errors
        if (message.includes('409') || 
            message.includes('conversation') || 
            message.includes('memory') ||
            message.includes('jwt') ||
            message.includes('token')) {
            
            if (window.logError) {
                window.logError('Memory System Error', message);
            }
        }
    };
    
    console.warn = function(...args) {
        originalConsoleWarn.apply(console, args);
        const message = args.join(' ');
        
        // Check for memory-related warnings
        if (message.includes('conversation') || 
            message.includes('memory') ||
            message.includes('context')) {
            
            if (window.logError) {
                window.logError('Memory System Warning', message);
            }
        }
    };
    
    // Monitor network requests for 409 errors
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch.apply(this, args)
            .then(response => {
                if (response.status === 409) {
                    if (window.logError) {
                        window.logError('HTTP 409 Conflict', `Request to ${response.url} returned 409 - potential conversation memory conflict`);
                    }
                }
                return response;
            });
    };
    
    console.log('🔍 Enhanced conversation memory monitoring enabled');
}

// Initialize enhanced monitoring
setupConversationMemoryMonitoring();

// Export for use in HTML
window.widgetAutomation = widgetAutomation;
window.runMemoryTest = runMemoryTest;

console.log('🤖 Widget automation script loaded successfully');