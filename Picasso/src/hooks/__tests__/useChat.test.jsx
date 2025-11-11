import { renderHook } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { useChat } from '../useChat';
import { ChatProvider } from '../../context/ChatProvider';
import { ConfigProvider } from '../../context/ConfigProvider';

describe('useChat', () => {
  it('should throw error when used outside ChatProvider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // renderHook with an error will store it in result.error
    let renderResult;
    try {
      renderResult = renderHook(() => useChat());
    } catch (error) {
      // If error thrown synchronously during setup, that's also valid
      expect(error.message).toBe('useChat must be used within a ChatProvider');
      consoleSpy.mockRestore();
      return;
    }

    // If we get here, check for error in result
    if (renderResult) {
      expect(renderResult.result.error).toBeDefined();
      expect(renderResult.result.error.message).toBe('useChat must be used within a ChatProvider');
    }

    consoleSpy.mockRestore();
  });

  it('should return chat context when used within ChatProvider', () => {
    const wrapper = ({ children }) => (
      <ConfigProvider>
        <ChatProvider>{children}</ChatProvider>
      </ConfigProvider>
    );

    const { result } = renderHook(() => useChat(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.messages).toBeDefined();
    expect(result.current.isTyping).toBeDefined();
    expect(result.current.addMessage).toBeDefined();
    expect(result.current.updateMessage).toBeDefined();
    expect(result.current.clearMessages).toBeDefined();
    expect(result.current.retryMessage).toBeDefined();
  });
}); 