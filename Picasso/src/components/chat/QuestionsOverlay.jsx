// src/components/chat/QuestionsOverlay.jsx
//
// Hairline redesign (W3.2): Common questions overlay.
//
// DESIGN_SPEC.md "2. Common questions (`10a Common questions`)": dimmed +
// blurred underlay over the whole shell, an overlay card inset 18px from the
// sides / 58px from the top, rows built from `quick_help.prompts`. Summoned
// from WelcomeView.jsx's "Common questions" row via ChatWidget.jsx's
// `onOpenQuestions`/`showQuestionsOverlay` wiring. Replaces
// FollowUpPromptBar.jsx's sliding "Help Menu" pill + quick-help panel
// (mapping doc §3: "Rebuild as overlay; same `quick_help` config; row tap
// sends as user message (same as today)") — FollowUpPromptBar.jsx itself is
// deleted by this item (grepped: ChatFooter.jsx was its only consumer).
//
// FROZEN send behavior (HAIRLINE_WORKPLAN.md ground rule #2 + W3.2
// guardrails): selecting a row must dispatch the EXACT SAME payload
// FollowUpPromptBar.jsx's `handleClick` did —
// `addMessage({ role: "user", content: prompt })`, gated on `!isTyping`
// (the old panel silently ignored clicks while a response was streaming).
// See `handleSelect` below.
//
// Presentation-only simplifications (this item's call, not a behavior/schema
// change — see PR description): `quick_help.title` and `quick_help.toggle_text`
// are no longer read. The overlay's header label is now FIXED Hairline
// chrome copy (`strings.questionsOverlay.title`, "Common questions" per
// DESIGN_SPEC.md's header row), and there is no floating toggle button
// anymore — the sole entry point is the welcome menu row (W3.1). Likewise
// `quick_help.close_after_selection` is not read: DESIGN_SPEC.md screen 2
// states selecting a question always closes the overlay ("Selecting a
// question closes the overlay and sends it as a user message") with no
// non-closing variant in any mock. All three fields remain valid,
// tolerated-and-ignored config — the same pattern the mapping doc documents
// for other superseded `branding.*` fields — not a schema change.
import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import strings from "../../i18n/strings";

// Preserves FollowUpPromptBar.jsx's exact fallback list so a tenant that
// never configured quick_help.prompts sees no content regression from the
// re-skin (a11y/behavior parity, not a new default).
const DEFAULT_PROMPTS = [
  "Tell me about volunteering",
  "Where does my donation go?",
  "How can I get involved?",
  "What volunteer opportunities are available?",
  "How can I make a donation?",
  "What impact does my support have?",
];

export default function QuestionsOverlay({ onClose }) {
  const { addMessage, isTyping } = useChat();
  const { config } = useConfig();

  const cardRef = useRef(null);
  const closeButtonRef = useRef(null);

  const quickHelpConfig = config?.quick_help || {};
  const prompts = quickHelpConfig.prompts?.length ? quickHelpConfig.prompts : DEFAULT_PROMPTS;

  // A11y (HAIRLINE_WORKPLAN.md ground rule #7): focus moves onto the overlay
  // on mount (same pattern as SettingsView.jsx's back-button focus).
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // A11y: ESC + outside-tap dismiss (same pattern as AttachmentMenu.jsx /
  // SettingsView.jsx).
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }
    function handlePointerDown(event) {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        onClose?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [onClose]);

  // DESIGN_SPEC.md screen 2: "Selecting a question closes the overlay and
  // sends it as a user message." Payload is byte-identical to
  // FollowUpPromptBar.jsx's handleClick — see file header comment.
  const handleSelect = (prompt) => {
    if (isTyping) return;
    addMessage({ role: "user", content: prompt });
    onClose?.();
  };

  return (
    <div className="hairline-questions-overlay">
      <div className="hairline-questions-underlay" aria-hidden="true" />
      <div
        ref={cardRef}
        className="hairline-questions-card"
        role="dialog"
        aria-modal="true"
        aria-label={strings.questionsOverlay.title}
      >
        <div className="hairline-questions-header">
          <h3 className="hairline-questions-title">{strings.questionsOverlay.title}</h3>
          <button
            ref={closeButtonRef}
            type="button"
            className="hairline-icon-button"
            onClick={() => onClose?.()}
            aria-label="Close common questions"
          >
            <X size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="hairline-questions-rows">
          {prompts.map((prompt, index) => (
            <button
              key={index}
              type="button"
              className="hairline-questions-row"
              onClick={() => handleSelect(prompt)}
              disabled={isTyping}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
