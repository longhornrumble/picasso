import { useContext } from 'react';
import { ChatContext } from '../context/shared/ChatContext';

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }

  // Deep debug: Check actual message objects
  if (context.messages?.length > 0) {
    const messagesDebug = context.messages.map(m => ({
      id: m.id,
      role: m.role,
      ctaButtons: m.ctaButtons,
      hasCtaButtons: !!m.ctaButtons,
      ctaButtonsLength: m.ctaButtons?.length
    }));
    console.log('[useChat] CRITICAL - Individual messages:', JSON.stringify(messagesDebug, null, 2));
  }

  // Debug: Log what useChat is returning
  console.log('[useChat] Context received:', {
    messagesLength: context.messages?.length,
    messagesWithCTAs: context.messages?.filter(m => m.ctaButtons?.length > 0).length,
    latestMessage: context.messages?.[context.messages.length - 1],
    latestMessageCTAs: context.messages?.[context.messages.length - 1]?.ctaButtons,
    contextKeys: Object.keys(context)
  });

  return context;
};

export default useChat; 