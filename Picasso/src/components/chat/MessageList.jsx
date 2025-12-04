// src/components/chat/MessageList.jsx - Clean version with action chips removed
import React, { useEffect, useRef } from "react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function MessageList({ 
  enableAutoScroll = true,
  scrollBehavior: _scrollBehavior = 'smooth',
  scrollToPosition: _scrollToPosition = 'start'
}) {
  const { messages, isTyping, renderMode } = useChat();
  const { config: _config } = useConfig();
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
      requestAnimationFrame(() => {
        scrollToBottom();
      });
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
  
  // Dev: warn if any message is missing a stable id (can cause remounts and wipe streaming text)
  try {
    if (Array.isArray(messages)) {
      const missing = messages.filter(m => !m?.id).length;
      if (missing) {
        console.warn(`[MessageList] ${missing} message(s) missing id; streaming may remount those bubbles`);
      }
    }
  } catch {}

  return (
    <div 
      ref={containerRef}
      className="message-list-container"
    >
      {messages && messages.map((msg, index) => {
        const stableKey = msg.streamId || msg.dataStreamId || msg.messageId || msg.id || index;

        // Consistent streaming flag with no content-based heuristics
        const isStreamingProp = (
          msg.isStreaming === true ||
          msg.streaming === true ||
          (msg?.metadata?.isStreaming === true)
        );

        return (
          <div
            key={stableKey}
            className="message-wrapper"
            data-message-id={stableKey}
            data-stream-id={stableKey}
          >
            <MessageBubble
              id={stableKey}
              messageId={msg.messageId || stableKey}
              streamId={stableKey}
              dataStreamId={stableKey}

              role={msg.role}
              content={isStreamingProp ? '' : msg.content}
              files={msg.files}
              uploadState={msg.uploadState}
              onCancel={msg.onCancel}
              actions={msg.actions}

              isStreaming={isStreamingProp}
              metadata={msg.metadata}
              renderMode={renderMode}

              // Card and CTA props
              showcaseCard={msg.showcaseCard}
              ctaButtons={msg.ctaButtons}
              cards={msg.cards}
            />
          </div>
        );
      })}
      
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