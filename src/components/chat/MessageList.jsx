// src/components/chat/MessageList.jsx - Clean version with action chips removed
import React, { useEffect, useRef } from "react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function MessageList({ 
  enableAutoScroll = true,
  scrollBehavior = 'smooth',
  scrollToPosition = 'start'
}) {
  const { messages, isTyping } = useChat();
  const { config } = useConfig();
  const containerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Simple, reliable auto-scroll function
  const scrollToBottom = () => {
    if (!enableAutoScroll) return;
    
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  // Scroll when messages change
  useEffect(() => {
    if (messages?.length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  }, [messages]);

  // Scroll when typing state changes
  useEffect(() => {
    if (isTyping) {
      setTimeout(scrollToBottom, 50);
    }
  }, [isTyping]);

  // Scroll on mount
  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, []);

  console.log("MessageList messages:", messages);
  
  return (
    <div 
      ref={containerRef}
      className="message-list-container"
    >
      {messages && messages.map((msg, idx) => (
        <React.Fragment key={msg.id || idx}>
          <div className="message-wrapper">
            <MessageBubble 
              role={msg.role} 
              content={msg.content}
              files={msg.files}
              uploadState={msg.uploadState}
              onCancel={msg.onCancel}
              actions={msg.actions}
            />
          </div>
        </React.Fragment>
      ))}
      
      {/* Typing Indicator */}
      {isTyping && (
        <div className="typing-wrapper">
          <TypingIndicator />
        </div>
      )}
      
      {/* Invisible element at the end for scrolling */}
      <div ref={messagesEndRef} />
    </div>
  );
}