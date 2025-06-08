// src/context/ChatProvider.jsx - Cleaned up with new architecture
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useConfig } from "./ConfigProvider";

const ChatContext = createContext();

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  const { config: tenantConfig } = useConfig();
  
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  // FIXED: Consolidate action chips logic into single function
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

  // UPDATED: Generate welcome message with proper action chips logic
  useEffect(() => {
    if (tenantConfig) {
      const welcomeActions = generateWelcomeActions(tenantConfig);

      setMessages([{
        id: "welcome",
        role: "assistant",
        content: tenantConfig.welcome_message || "Hello! How can I help you today?",
        actions: welcomeActions
      }]);
    }
  }, [tenantConfig, generateWelcomeActions]);

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
    
    // Call API for user messages (excluding uploads and system messages)
    if (message.role === "user" && !message.skipBotResponse && !message.uploadState) {
      console.log('✅ Should call API, setting typing and calling...');
      setIsTyping(true);
      
      const makeAPICall = async () => {
        try {
          console.log('🚀 Making API call...');
          
          const response = await fetch('https://chat.myrecruiter.ai/Master_Function', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'a650f1b1661d6871df06237d7d2b8ab8'
            },
            body: JSON.stringify({
              tenant_id: tenantConfig?.tenant_id || "FOS402334", // FIXED: Use dynamic tenant ID
              user_input: message.content,
              context: {
                session_id: `session_${Date.now()}`,
                files: message.files || []
              }
            })
          });
          
          console.log('📡 Response status:', response.status);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const rawText = await response.text();
          console.log('📥 RAW RESPONSE TEXT:', rawText);
          
          let data;
          try {
            data = JSON.parse(rawText);
            console.log('📥 PARSED RESPONSE:', data);
          } catch (e) {
            console.error('❌ Failed to parse JSON:', e);
            throw new Error('Invalid JSON response from server');
          }
          
          // IMPROVED: Parse response with better error handling
          let botContent = "I apologize, but I'm having trouble processing that request right now.";
          let botActions = [];
          
          try {
            // Parse Lex response format
            if (data.messages && data.messages[0] && data.messages[0].content) {
              const messageContent = JSON.parse(data.messages[0].content);
              botContent = messageContent.message || messageContent.content || botContent;
              
              // Extract action chips from response if available
              if (messageContent.actions && Array.isArray(messageContent.actions)) {
                botActions = messageContent.actions;
              }
            }
            // Fallback for HTTP format
            else if (data.body) {
              const bodyData = JSON.parse(data.body);
              botContent = bodyData.content || bodyData.message || botContent;
              
              if (bodyData.actions && Array.isArray(bodyData.actions)) {
                botActions = bodyData.actions;
              }
            }
            // Direct response formats
            else if (data.response) {
              botContent = data.response;
            } else if (data.content) {
              botContent = data.content;
            }
            
            // Extract actions from top-level if available
            if (data.actions && Array.isArray(data.actions)) {
              botActions = data.actions;
            }
            
          } catch (parseError) {
            console.error('❌ Error parsing response content:', parseError);
            // Keep the default error message
          }
          
          setMessages(prev => [...prev, {
            id: `bot_${Date.now()}_${Math.random()}`,
            role: "assistant",
            content: botContent,
            actions: botActions,
            timestamp: new Date().toISOString()
          }]);
          
        } catch (error) {
          console.error('❌ API Error:', error);
          
          // Add error message to chat
          setMessages(prev => [...prev, {
            id: `error_${Date.now()}_${Math.random()}`,
            role: "assistant",
            content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
            timestamp: new Date().toISOString()
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
    // FIXED: Use same logic as initial welcome message
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
    clearMessages
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};