// src/components/chat/SettingsView.jsx
//
// Hairline redesign (W3.3): Settings full-widget takeover.
//
// DESIGN_SPEC.md screen 5 — one scrolling grouped list (Conversation /
// Preferences / Your data), no tabs, full takeover, slide-in 240ms. Replaces
// StateManagementPanel.jsx's rendering (3-tab modal) as the destination for
// ChatHeader's settings icon; StateManagementPanel.jsx's *logic* survives in
// settingsHelpers.js (imported below) and its file is left on disk,
// unreferenced, for W6.2 to delete.
//
// FROZEN (HAIRLINE_WORKPLAN.md ground rule #2 + W3.3 guardrails): session-
// stat computation, history storage, the clear-all mechanism + its audit
// event (SESSION_CLEARED — emitted inside useChat().clearMessages() itself,
// in StreamingChatProvider.jsx/HTTPChatProvider.jsx — calling the same
// function fires the same event with zero extra code here), export format,
// and connection detection (a direct, non-reactive `navigator.onLine` read,
// exactly as the old panel did) are unchanged. Only presentation + the
// tabs→grouped-list restructure are new.
//
// D5 default applied (HAIRLINE_WORKPLAN.md): the mock's "Offline sync"
// toggle is omitted — no offline-sync feature exists to back it. See the
// W3.3 PR description for the full old-panel-function → new-home mapping,
// including the additional (non-D5) drops flagged there for sign-off.
//
// SLIMMED TO THE HONEST CORE (Chris decisions, 2026-07-03 — spec
// amendments 5+6): History (dead read — nothing ever wrote the archive it
// listed), Download (metadata-only export, sandbox-blocked), Current
// session + Connection (trivia), and the Storage row (a disclosure a
// key-value row can't explain) are all gone. What remains is the single
// "Your data" group: Privacy & compliance + Clear all messages, with the
// storage semantics told in plain English by the clear row's fine print
// ("stays in this browser's memory until you close this tab"). Transcript
// export, if ever wanted, is a new feature through the PII advisory gate.
// The Spanish language toggle (approved i18n P1) becomes the first real
// preference here when it ships. Clear-all still purges the vestigial
// history key alongside the real current-conversation session key.
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { errorLogger } from "../../utils/errorHandling";
import strings from "../../i18n/strings";
import { clearStoredConversationHistory } from "./settingsHelpers";

/** Focus trap: keeps Tab/Shift+Tab cycling within `containerRef`'s focusable
 * elements. The thread underneath stays mounted (that's what makes "back
 * preserves scroll" free — see ChatWidget.jsx), so it isn't `aria-hidden`;
 * this trap is what keeps keyboard focus from leaking into it while the
 * takeover is open. */
function useFocusTrap(containerRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll(
        'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, enabled]);
}

export default function SettingsView({ onBack, onClose, onOpenPrivacy }) {
  const chatContext = useChat();
  const { clearMessages } = chatContext;

  const rootRef = useRef(null);
  const backButtonRef = useRef(null);

  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState(null);

  // A11y (HAIRLINE_WORKPLAN.md ground rule #7 + W3.3 guardrails): focus
  // moves into the takeover on mount; ESC returns to the thread.
  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onBack?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  useFocusTrap(rootRef, true);

  const handleClearRowClick = () => {
    setClearError(null);
    setIsConfirmingClear(true);
  };

  const handleCancelClear = () => {
    setIsConfirmingClear(false);
    setClearError(null);
  };

  const handleConfirmClear = async () => {
    setIsClearing(true);
    setClearError(null);
    try {
      if (typeof clearMessages === "function") {
        await clearMessages();
      }
      clearStoredConversationHistory();
      setIsConfirmingClear(false);
      // DESIGN_SPEC.md Interactions & Behavior: "Clear messages: inline
      // confirm; on confirm, clears thread, logs audit event, returns to
      // welcome." clearMessages() (frozen, see file header) already
      // re-seeds the welcome message as the thread's only message when a
      // welcome_message is configured, so returning to the thread here IS
      // returning to welcome given the current (pre-W3.1) thread rendering.
      onBack?.();
    } catch (error) {
      errorLogger.logError(error, { context: "clear_state_ui" });
      setClearError(strings.settings.clearConfirm.errorLabel);
    } finally {
      setIsClearing(false);
    }
  };

  const handlePrivacyClick = () => {
    // W3.4 (HAIRLINE_WORKPLAN.md): opens the dedicated Privacy & compliance
    // takeover (DESIGN_SPEC.md screen 6, PrivacyView.jsx). ChatWidget.jsx
    // renders it as a sibling view at the same z-index tier as this
    // component (mutually exclusive, not nested inside this component's own
    // tree) — see ChatWidget.jsx's render comment for why.
    onOpenPrivacy?.();
  };

  return (
    <div
      ref={rootRef}
      className="hairline-settings-view"
      role="dialog"
      aria-modal="true"
      aria-label={strings.settings.pageTitle}
    >
      <>
          <div className="hairline-takeover-header">
            <div className="hairline-takeover-header-left">
              <button
                ref={backButtonRef}
                type="button"
                className="hairline-icon-button"
                onClick={onBack}
                aria-label="Back to conversation"
              >
                <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
              </button>
              <h3 className="hairline-page-title">{strings.settings.pageTitle}</h3>
            </div>
            <button type="button" className="hairline-icon-button" onClick={onClose} aria-label="Close chat">
              <X size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="hairline-settings-content">
            {/* Spec amendment 6 (Chris, 2026-07-03): the mock's Conversation
                (Current session / History) and Preferences (Connection /
                Offline sync) groups are gone — every row was either trivia
                or backed by no feature. Settings is the single "Your data"
                group: Privacy & compliance + Clear all messages, with the
                storage disclaimer folded into the clear row's fine print
                (an unactionable Storage row couldn't explain it). The
                Spanish language toggle (approved i18n P1) moves in as the
                first real preference when it ships. */}
            <h4 className="hairline-settings-group-label">{strings.settings.groups.yourData}</h4>
            <div className="hairline-settings-card">
              <button
                type="button"
                className="hairline-settings-row hairline-settings-row--button"
                onClick={handlePrivacyClick}
              >
                <span className="hairline-settings-row-label">{strings.settings.rows.privacyAndCompliance}</span>
                <span className="hairline-settings-chevron">
                  <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
                </span>
              </button>
            </div>

            {!isConfirmingClear ? (
              <button type="button" className="hairline-settings-clear-row" onClick={handleClearRowClick}>
                <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                <span>{strings.settings.clearAllMessages}</span>
              </button>
            ) : (
              <div className="hairline-settings-clear-confirm" role="alertdialog" aria-label={strings.settings.clearConfirm.title}>
                <div className="hairline-settings-clear-confirm-title">{strings.settings.clearConfirm.title}</div>
                <div className="hairline-settings-clear-confirm-body">{strings.settings.clearConfirm.body}</div>
                {clearError && (
                  <div className="hairline-settings-clear-confirm-error" role="alert">
                    {clearError}
                  </div>
                )}
                <div className="hairline-settings-clear-confirm-actions">
                  <button
                    type="button"
                    className="hairline-pill-button hairline-pill-button--danger"
                    onClick={handleConfirmClear}
                    disabled={isClearing}
                  >
                    {isClearing ? strings.settings.clearConfirm.confirmingLabel : strings.settings.clearConfirm.confirmLabel}
                  </button>
                  <button
                    type="button"
                    className="hairline-pill-button hairline-pill-button--outline"
                    onClick={handleCancelClear}
                    disabled={isClearing}
                  >
                    {strings.settings.clearConfirm.cancelLabel}
                  </button>
                </div>
              </div>
            )}

            {!isConfirmingClear && (
              <p className="hairline-settings-fine-print">{strings.settings.clearAllMessagesFinePrint}</p>
            )}
          </div>
      </>
    </div>
  );
}
