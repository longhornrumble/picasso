import React from "react";
import { useConfig } from "../../hooks/useConfig";
import { X, Sliders } from "lucide-react";

/**
 * ChatHeader — Hairline redesign (W2.1).
 *
 * Per design/hairline/DESIGN_SPEC.md "Widget Shell" header + screens 1/3:
 * caps wordmark (chat_title) left, settings (sliders) + close (X) icons
 * right. No avatar/logo image, no subtitle, no help icon — dropped per the
 * fidelity rule (HAIRLINE_REDESIGN_MAPPING.md §0): nothing consumed those
 * fields beyond decorative rendering, so dropping them is a styling change,
 * not a functionality change.
 *
 * Frozen functionality (HAIRLINE_WORKPLAN.md ground rule #2): the
 * onClose/onOpenSettings handlers and the chat_title read below are
 * unchanged from the pre-Hairline header.
 */
export default function ChatHeader({ onClose, onOpenSettings }) {
  const { config } = useConfig();

  // Same read as the pre-Hairline header — chat_title sourcing is frozen.
  const chatTitle = config?.branding?.chat_title || "Chat";

  return (
    <header className="hairline-header">
      <h3 className="hairline-wordmark">{chatTitle}</h3>

      <div className="hairline-header-icons">
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="hairline-icon-button"
            aria-label="Open chat settings"
          >
            <Sliders size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="hairline-icon-button"
          aria-label="Close chat"
        >
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
