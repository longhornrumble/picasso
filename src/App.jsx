import React from 'react';
import { ConfigProvider } from './context/ConfigProvider';
import { ChatProvider } from './context/ChatProvider';
import { CSSVariablesProvider } from './components/chat/useCSSVariables';
import ChatWidget from './components/chat/ChatWidget';

function App() {
  return (
    <ConfigProvider>
      <CSSVariablesProvider>
        <ChatProvider>
          <ChatWidget />
        </ChatProvider>
      </CSSVariablesProvider>
    </ConfigProvider>
  );
}

export default App;