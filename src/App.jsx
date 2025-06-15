import React from 'react';
import { ConfigProvider } from './context/ConfigProvider';
import { ChatProvider } from './context/ChatProvider';
import { CSSVariablesProvider } from './components/chat/useCSSVariables';
import ChatWidget from './components/chat/ChatWidget';
import FullPageChat from './components/chat/FullPageChat';

function App() {
  // Detect mode from global config
  const mode = window.PicassoConfig?.mode || 'widget';
  const isFullPage = mode === 'fullpage';

  return (
    <ConfigProvider>
      <CSSVariablesProvider>
        <ChatProvider>
          {isFullPage ? (
            <FullPageChat />
          ) : (
            <ChatWidget />
          )}
        </ChatProvider>
      </CSSVariablesProvider>
    </ConfigProvider>
  );
}

export default App;