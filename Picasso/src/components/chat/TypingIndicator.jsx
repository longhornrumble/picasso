// TypingIndicator.jsx — Hairline redesign (W2.2)
//
// DESIGN_SPEC.md "Loading" interaction note: "bot typing = three-dot pulse
// under the wordmark sender label (not mocked; keep to the same quiet
// palette)." Reuses the exact same `.hairline-message`/`.hairline-message-group`/
// `.hairline-sender-label` classes MessageBubble.jsx renders for a real bot
// reply, so a typing indicator is visually just "a bot message group whose
// body is three pulsing dots instead of text" — same 16px group spacing,
// same wordmark-style label, no avatar.
import React from "react";
import { useConfig } from "../../hooks/useConfig";

export default function TypingIndicator() {
  const { config } = useConfig();
  // Same resolution as MessageBubble.jsx's bot sender label (chat_title,
  // matching ChatHeader.jsx's wordmark) — kept in sync deliberately.
  const chatTitle = config?.branding?.chat_title || "Chat";

  return (
    <div className="hairline-message hairline-message--bot hairline-typing">
      <div className="hairline-message-group">
        <div className="hairline-sender-label hairline-sender-label--bot">
          {chatTitle}
        </div>
        <div className="hairline-typing-dots" role="status" aria-live="polite">
          <span className="hairline-typing-dot" aria-hidden="true"></span>
          <span className="hairline-typing-dot" aria-hidden="true"></span>
          <span className="hairline-typing-dot" aria-hidden="true"></span>
          <span className="visually-hidden">{`${chatTitle} is typing…`}</span>
        </div>
      </div>
    </div>
  );
}
