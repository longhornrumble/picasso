import { useContext } from 'react';
import { getChatContext } from '../context/ChatProvider';

export const useChat = () => {
  const ChatContext = getChatContext();
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export default useChat; 