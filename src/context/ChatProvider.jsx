// src/context/ChatProvider.jsx - Updated for Actions API Response Format
import React, { createContext, useState, useCallback, useEffect } from "react";
import { useConfig } from "../hooks/useConfig";

const ChatContext = createContext();

// Function to get the context for hooks
export const getChatContext = () => ChatContext;

// Export provider as const
const ChatProvider = ({ children }) => {
  const { config: tenantConfig } = useConfig();
  
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasInitializedMessages, setHasInitializedMessages] = useState(false);

  // Generate welcome actions from config
  const generateWelcomeActions = useCallback((config) => {
    if (!config) return [];
    
    const actionChipsConfig = config.action_chips || {};
    
    // Check if action chips are enabled and should show on welcome
    if (!actionChipsConfig.enabled || !actionChipsConfig.show_on_welcome) {
      return [];
    }
    
    const chips = actionChipsConfig.default_chips || [];
    const maxDisplay = actionChipsConfig.max_display || 3;
    
    return chips.slice(0, maxDisplay);
  }, []);

  // Generate welcome message ONLY on initial load - prevent resets on config updates
  useEffect(() => {
    if (tenantConfig && !hasInitializedMessages) {
      console.log('🎬 Setting initial welcome message');
      const welcomeActions = generateWelcomeActions(tenantConfig);

      setMessages([{
        id: "welcome",
        role: "assistant",
        content: tenantConfig.welcome_message || "Hello! How can I help you today?",
        actions: welcomeActions
      }]);
      
      setHasInitializedMessages(true);
    }
  }, [tenantConfig, generateWelcomeActions, hasInitializedMessages]);

  // Get tenant hash for API calls
  const getTenantHash = () => {
    return tenantConfig?.tenant_hash || 
           tenantConfig?.metadata?.tenantHash || 
           window.PicassoConfig?.tenant ||
           'fo85e6a06dcdf4'; // Fallback
  };

  const addMessage = useCallback((message) => {
    const messageWithId = {
      id: message.id || `msg_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toISOString(),
      ...message
    };
    
    setMessages(prev => {
      if (message.replaceId) {
        return prev.map(msg => 
          msg.id === message.replaceId ? messageWithId : msg
        );
      }
      return [...prev, messageWithId];
    });
    
    // Notify parent of message sent (PRD requirement)
    if (message.role === "user" && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_EVENT',
        event: 'MESSAGE_SENT',
        payload: {
          content: message.content,
          files: message.files || [],
          messageId: messageWithId.id
        }
      }, '*');
    }
    
    // ✅ ACTIONS ONLY: Call chat API for user messages
    if (message.role === "user" && !message.skipBotResponse && !message.uploadState) {
      console.log('✅ Making chat request via actions API');
      setIsTyping(true);
      
      const makeAPICall = async () => {
        try {
          const tenantHash = getTenantHash();
          console.log('🚀 Making chat API call with hash:', tenantHash.slice(0, 8) + '...');
          
          // ✅ SINGLE PATH: Use actions-only chat API
          const response = await fetch('https://chat.myrecruiter.ai/Master_Function?action=chat&t=' + encodeURIComponent(tenantHash), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              tenant_hash: tenantHash, // Include hash in body for redundancy
              user_input: message.content,
              session_id: `session_${Date.now()}`,
              files: message.files || []
            })
          });
          
          console.log('📡 Chat response status:', response.status);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Chat API error:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const rawText = await response.text();
          console.log('📥 RAW CHAT RESPONSE:', rawText);
          
          let data;
          try {
            data = JSON.parse(rawText);
            console.log('📥 PARSED CHAT RESPONSE:', data);
          } catch (e) {
            console.error('❌ Failed to parse JSON:', e);
            throw new Error('Invalid JSON response from server');
          }
          
          // 🔧 FIXED: Parse new Lambda response format
          let botContent = "I apologize, but I'm having trouble processing that request right now.";
          let botActions = [];
          
          try {
            // ✅ NEW: Handle direct actions API response format
            if (data.content) {
              // Direct response from new Lambda format
              botContent = data.content;
              
              // Extract actions if available
              if (data.actions && Array.isArray(data.actions)) {
                botActions = data.actions;
              }
            }
            // Legacy Lex response format support
            else if (data.messages && data.messages[0] && data.messages[0].content) {
              const messageContent = JSON.parse(data.messages[0].content);
              botContent = messageContent.message || messageContent.content || botContent;
              
              if (messageContent.actions && Array.isArray(messageContent.actions)) {
                botActions = messageContent.actions;
              }
            }
            // HTTP wrapper format
            else if (data.body) {
              const bodyData = JSON.parse(data.body);
              botContent = bodyData.content || bodyData.message || botContent;
              
              if (bodyData.actions && Array.isArray(bodyData.actions)) {
                botActions = bodyData.actions;
              }
            }
            // Other response formats
            else if (data.response) {
              botContent = data.response;
            }
            
            // Check for error fallback message
            if (data.fallback_message) {
              botContent = data.fallback_message;
            }
            
            // Handle file acknowledgment
            if (data.file_acknowledgment) {
              botContent += "\n\n" + data.file_acknowledgment;
            }
            
          } catch (parseError) {
            console.error('❌ Error parsing response content:', parseError);
            
            // If parsing fails, try to use the raw response
            if (typeof data === 'string') {
              botContent = data;
            }
          }
          
          // ✅ Add response message to chat
          setMessages(prev => [...prev, {
            id: `bot_${Date.now()}_${Math.random()}`,
            role: "assistant", 
            content: botContent,
            actions: botActions,
            timestamp: new Date().toISOString(),
            metadata: {
              session_id: data.session_id,
              api_version: data.api_version || 'actions-complete'
            }
          }]);
          
          console.log('✅ Chat response processed successfully', {
            contentLength: botContent.length,
            actionsCount: botActions.length,
            sessionId: data.session_id
          });
          
        } catch (error) {
          console.error('❌ Chat API Error:', error);
          
          // Add error message to chat with helpful info
          setMessages(prev => [...prev, {
            id: `error_${Date.now()}_${Math.random()}`,
            role: "assistant",
            content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
            timestamp: new Date().toISOString(),
            metadata: {
              error: error.message,
              api_type: 'actions-chat'
            }
          }]);
        } finally {
          setIsTyping(false);
        }
      };
      
      makeAPICall();
    }
  }, [tenantConfig]);

  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  }, []);

  const clearMessages = useCallback(() => {
    console.log('🗑️ Manually clearing messages');
    // Reset to welcome message
    if (tenantConfig) {
      const welcomeActions = generateWelcomeActions(tenantConfig);

      setMessages([{
        id: "welcome",
        role: "assistant",
        content: tenantConfig.welcome_message || "Hello! How can I help you today?",
        actions: welcomeActions
      }]);
    } else {
      // Fallback if no config
      setMessages([{
        id: "welcome",
        role: "assistant", 
        content: "Hello! How can I help you today?",
        actions: []
      }]);
    }
  }, [tenantConfig, generateWelcomeActions]);

  const value = {
    messages,
    isTyping,
    tenantConfig,
    addMessage,
    updateMessage,
    clearMessages,
    // Debug info
    _debug: {
      tenantHash: getTenantHash(),
      apiType: 'actions-only',
      configLoaded: !!tenantConfig,
      chatEndpoint: `https://chat.myrecruiter.ai/Master_Function?action=chat&t=${getTenantHash()}`
    }
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

// Global debugging functions
if (typeof window !== 'undefined') {
  // Test chat API directly
  window.testChatAPI = async (message, tenantHash) => {
    const hash = tenantHash || 'fo85e6a06dcdf4';
    console.log('🧪 Testing chat API...');
    
    try {
      const response = await fetch(`https://chat.myrecruiter.ai/Master_Function?action=chat&t=${hash}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenant_hash: hash,
          user_input: message || "Hello, this is a test message",
          session_id: `test_${Date.now()}`
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Chat API Test Response:', data);
        console.log('📝 Bot said:', data.content);
        if (data.actions && data.actions.length > 0) {
          console.log('🎯 Available actions:', data.actions.map(a => a.label));
        }
        return data;
      } else {
        const errorText = await response.text();
        console.error('❌ Chat API Test Failed:', response.status, errorText);
        return null;
      }
    } catch (error) {
      console.error('❌ Chat API Test Error:', error);
      return null;
    }
  };

  // Quick test with different messages
  window.testVolunteer = () => window.testChatAPI("I want to volunteer");
  window.testDonate = () => window.testChatAPI("How can I donate?");
  window.testContact = () => window.testChatAPI("How do I contact you?");
  window.testServices = () => window.testChatAPI("What services do you offer?");

  console.log(`
🛠️  CHAT API TEST COMMANDS:
   testChatAPI("your message")     - Test any message
   testVolunteer()                 - Test volunteer response
   testDonate()                    - Test donation response  
   testContact()                   - Test contact response
   testServices()                  - Test services response
  `);
}

// Export only the provider
export { ChatProvider };