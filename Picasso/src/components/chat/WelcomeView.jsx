// src/components/chat/WelcomeView.jsx
//
// Hairline redesign (W3.1): distinct welcome view.
//
// DESIGN_SPEC.md "1. Welcome (`10a Welcome`)": greeting (fixed copy, D7) +
// welcome_message paragraph + a menu card built from
// `action_chips.default_chips` with a fixed "Common questions" row
// appended. Rendered by ChatWidget.jsx in place of the thread's message
// list while no conversation has started yet (see ChatWidget.jsx's
// `activeView` derivation) — the header and composer/footer are unchanged
// between welcome and thread, so this component owns only the content area.
//
// Menu-row dispatch (FROZEN, HAIRLINE_WORKPLAN.md ground rule #2 + W3.1
// guardrails): a tenant chip row must send the EXACT SAME payload to the
// backend as today's action-chip pills. `dispatchChip` below is a
// deliberate, careful copy of MessageBubble.jsx's `handleActionClick`
// "send_query" branch (the only branch `default_chips` can reach — the
// schema has no `action` field for default_chips; see
// TENANT_CONFIG_SCHEMA.md "v1.4 Dictionary Format" / "v1.3 Array Format").
// It is copied rather than imported because MessageBubble.jsx is
// single-owner (HAIRLINE_WORKPLAN.md W2.2, PR #645) and this item's
// guardrails say not to touch it. Parity between the two implementations
// is pinned by a dedicated test
// (`__tests__/welcomeMenuChipDispatchParity.test.jsx`) that renders both
// components and asserts the `addMessage` payload is byte-identical for
// the same chip — see that file if this function ever needs to change.
import React from "react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import strings from "../../i18n/strings";
import { ACTION_CHIP_CLICKED } from "../../analytics/eventConstants";

/**
 * Emit analytics event via global notifyParentEvent (mirrors the identical
 * helper in MessageBubble.jsx / the providers).
 */
function emitAnalyticsEvent(eventType, payload) {
  if (typeof window !== "undefined" && window.notifyParentEvent) {
    window.notifyParentEvent(eventType, payload);
  }
}

export default function WelcomeView({ onOpenQuestions }) {
  const { addMessage, isTyping } = useChat();
  const { config } = useConfig();

  const welcomeMessage = config?.welcome_message;

  const actionChipsConfig = config?.action_chips || {};
  const chipsVisible = actionChipsConfig.enabled && actionChipsConfig.show_on_welcome;
  const rawChips = actionChipsConfig.default_chips || {};
  // Handle both array (legacy v1.3) and dictionary (v1.4.1) formats.
  const allChips = Array.isArray(rawChips) ? rawChips : Object.values(rawChips);
  const maxDisplay = actionChipsConfig.max_display || 3;
  const chips = chipsVisible ? allChips.slice(0, maxDisplay) : [];

  // W3.2 (QuestionsOverlay.jsx): tolerant read, default true — mirrors
  // FollowUpPromptBar.jsx's old `enabled !== false` default so a tenant that
  // never set quick_help.enabled keeps seeing the row.
  const quickHelpEnabled = config?.quick_help?.enabled !== false;

  // Byte-identical to MessageBubble.jsx's handleActionClick "send_query"
  // path — see file header comment.
  const dispatchChip = (chip) => {
    if (isTyping) return;

    emitAnalyticsEvent(ACTION_CHIP_CLICKED, {
      chip_id: chip.id || chip.label,
      chip_label: chip.label,
      target_branch: chip.target_branch || null,
      chip_action: chip.action || "send_query",
    });

    const messageText = chip.value || chip.label;
    const messagePayload = { role: "user", content: messageText };

    if (chip.target_branch) {
      messagePayload.metadata = {
        action_chip_triggered: true,
        target_branch: chip.target_branch,
        action_chip_id: chip.id || chip.label,
      };
    }

    addMessage(messagePayload);
  };

  return (
    <div className="hairline-welcome-view">
      <h3 className="hairline-welcome-greeting">{strings.welcome.greeting}</h3>

      {welcomeMessage && <p className="hairline-welcome-message">{welcomeMessage}</p>}

      {/* Plain bordered card of rows (no list/listitem ARIA roles) — each
          row is a native <button> and must keep its implicit "button"
          accessible role. Setting role="listitem" directly on a <button>
          would OVERRIDE that to "listitem", which is how an earlier draft
          of this file accidentally broke keyboard/AT semantics — caught by
          WelcomeView.test.jsx's aria-label assertion resolving to the wrong
          role. Same plain-card-of-buttons pattern as SettingsView.jsx. */}
      <div className="hairline-menu-card">
        {chips.map((chip, index) => (
          <button
            key={chip.id || chip.label || index}
            type="button"
            className="hairline-menu-row"
            onClick={() => dispatchChip(chip)}
            disabled={isTyping}
            aria-label={chip.label}
          >
            <span className="hairline-menu-row-label">{chip.label}</span>
            <span className="hairline-menu-row-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}

        {/* Fixed row (copy not tenant-gated) — DESIGN_SPEC.md "Common
            questions (folded into the menu)". Opens the questions overlay
            (DESIGN_SPEC.md screen 2, W3.2's QuestionsOverlay.jsx) via
            ChatWidget.jsx's `onOpenQuestions`. The row ITSELF is gated on
            `quick_help.enabled` (tolerant read, default true) — W3.2's
            "hide the entry point when quick_help.enabled===false" done
            criterion — same pattern as the tenant chips above. */}
        {quickHelpEnabled && (
          <button
            type="button"
            className="hairline-menu-row"
            onClick={onOpenQuestions}
            aria-label={strings.welcome.commonQuestionsRow}
          >
            <span className="hairline-menu-row-label">{strings.welcome.commonQuestionsRow}</span>
            <span className="hairline-menu-row-arrow" aria-hidden="true">
              →
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
