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
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, History, RefreshCw, Trash2, X } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { errorLogger } from "../../utils/errorHandling";
import { config as environmentConfig } from "../../config/environment";
import strings from "../../i18n/strings";
import {
  buildConversationExportPayload,
  clearStoredConversationHistory,
  formatConversationDate,
  formatConversationDuration,
  loadStoredConversationHistory,
  triggerJSONDownload,
} from "./settingsHelpers";

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

function HistoryListSubView({ onBack, onClose, isLoading, history }) {
  const backRef = useRef(null);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <>
      <div className="hairline-takeover-header">
        <div className="hairline-takeover-header-left">
          <button
            ref={backRef}
            type="button"
            className="hairline-icon-button"
            onClick={onBack}
            aria-label="Back to settings"
          >
            <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <h3 className="hairline-page-title">{strings.settings.rows.history}</h3>
        </div>
        <button type="button" className="hairline-icon-button" onClick={onClose} aria-label="Close chat">
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="hairline-settings-content">
        {isLoading ? (
          <div className="hairline-settings-history-loading">
            <RefreshCw size={16} strokeWidth={2} className="hairline-spin" aria-hidden="true" />
            Loading history…
          </div>
        ) : history.length > 0 ? (
          <ul className="hairline-settings-history-list">
            {history.map((conv, index) => (
              <li key={conv.conversationId || index} className="hairline-settings-history-item">
                <div className="hairline-settings-history-item-header">
                  <span>{formatConversationDate(conv.metadata?.created)}</span>
                  <span>{conv.messages?.length || 0} messages</span>
                </div>
                <div className="hairline-settings-history-item-duration">
                  {formatConversationDuration(conv)}
                </div>
                {conv.metadata?.lastSummary && (
                  <div className="hairline-settings-history-item-summary">
                    {conv.metadata.lastSummary.slice(0, 60)}…
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="hairline-settings-empty-state">
            <History size={28} strokeWidth={2} aria-hidden="true" />
            <p>No conversation history found</p>
          </div>
        )}
      </div>
    </>
  );
}

export default function SettingsView({ onBack, onClose }) {
  const chatContext = useChat();
  const { conversationMetadata = {}, clearMessages, messages = [] } = chatContext;

  const rootRef = useRef(null);
  const backButtonRef = useRef(null);

  const [subView, setSubView] = useState("list"); // 'list' | 'history'
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState(null);
  const [downloadStatus, setDownloadStatus] = useState("idle"); // 'idle' | 'success' | 'error'

  // Same read as the pre-Hairline panel: a direct, non-reactive
  // navigator.onLine check (frozen — see file header).
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  // Load history on mount — mirrors the old panel loading it whenever its
  // History tab (the default tab) was visible on open.
  useEffect(() => {
    setIsLoadingHistory(true);
    try {
      setConversationHistory(loadStoredConversationHistory(10));
    } catch (error) {
      errorLogger.logError(error, { context: "load_conversation_history" });
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

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
      setConversationHistory([]);
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

  const handleDownload = () => {
    try {
      // Same computation as the pre-Hairline panel (frozen — see
      // settingsHelpers.js's buildConversationExportPayload doc comment for
      // the pre-existing "undefined..." quirk this preserves verbatim).
      const tenantHashDisplay = `${environmentConfig.getTenantHashFromURL()?.slice(0, 8)}...`;
      const payload = buildConversationExportPayload({
        tenantHashDisplay,
        messages,
        conversationMetadata,
        conversationHistory,
      });
      triggerJSONDownload(payload, `picasso-conversations-${Date.now()}.json`);
      setDownloadStatus("success");
    } catch (error) {
      errorLogger.logError(error, { context: "export_conversations" });
      setDownloadStatus("error");
    } finally {
      setTimeout(() => setDownloadStatus("idle"), 2000);
    }
  };

  const handlePrivacyClick = () => {
    // W3.4 (HAIRLINE_WORKPLAN.md) owns the dedicated Privacy & compliance
    // takeover (DESIGN_SPEC.md screen 6) — sequenced after this item in the
    // workplan's dependency graph, not built yet. The row renders here per
    // the mock (chevron affordance) so the grouped list matches the design;
    // wiring is a deliberate no-op until W3.4 lands. See the W3.3 PR
    // description.
  };

  const messageCount = messages.length;
  const currentSessionValue = `${messageCount} ${messageCount === 1 ? "message" : "messages"}`;
  const historyValue =
    conversationHistory.length === 0
      ? strings.settings.rows.historyEmpty
      : `${conversationHistory.length} ${conversationHistory.length === 1 ? "conversation" : "conversations"}`;

  const downloadLabel =
    downloadStatus === "success"
      ? strings.settings.downloaded
      : downloadStatus === "error"
      ? strings.settings.downloadFailed
      : strings.settings.rows.downloadConversations;

  return (
    <div
      ref={rootRef}
      className="hairline-settings-view"
      role="dialog"
      aria-modal="true"
      aria-label={strings.settings.pageTitle}
    >
      {subView === "history" ? (
        <HistoryListSubView
          onBack={() => setSubView("list")}
          onClose={onClose}
          isLoading={isLoadingHistory}
          history={conversationHistory}
        />
      ) : (
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
            <h4 className="hairline-settings-group-label">{strings.settings.groups.conversation}</h4>
            <div className="hairline-settings-card">
              <div className="hairline-settings-row">
                <span className="hairline-settings-row-label">{strings.settings.rows.currentSession}</span>
                <span className="hairline-settings-row-value">{currentSessionValue}</span>
              </div>
              <button
                type="button"
                className="hairline-settings-row hairline-settings-row--button"
                onClick={() => setSubView("history")}
              >
                <span className="hairline-settings-row-label">{strings.settings.rows.history}</span>
                <span className="hairline-settings-row-value">
                  {historyValue}
                  <span className="hairline-settings-chevron">
                    <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
                  </span>
                </span>
              </button>
            </div>

            <h4 className="hairline-settings-group-label">{strings.settings.groups.preferences}</h4>
            <div className="hairline-settings-card">
              <div className="hairline-settings-row">
                <span className="hairline-settings-row-label">{strings.settings.rows.connection}</span>
                <span className="hairline-settings-row-value">
                  <span
                    className={`hairline-connection-dot ${isOnline ? "is-online" : "is-offline"}`}
                    aria-hidden="true"
                  />
                  {isOnline ? strings.settings.rows.connectionOnline : strings.settings.rows.connectionOffline}
                </span>
              </div>
              {/* D5 default (HAIRLINE_WORKPLAN.md W3.3): "Offline sync" row
                  omitted — no offline-sync feature exists to back the toggle
                  the mock shows. See the PR description. */}
            </div>

            <h4 className="hairline-settings-group-label">{strings.settings.groups.yourData}</h4>
            <div className="hairline-settings-card">
              <div className="hairline-settings-row">
                <span className="hairline-settings-row-label">{strings.settings.rows.storage}</span>
                <span className="hairline-settings-row-value">{strings.settings.rows.storageValue}</span>
              </div>
              <button
                type="button"
                className="hairline-settings-row hairline-settings-row--button"
                onClick={handleDownload}
              >
                <span className="hairline-settings-row-label hairline-settings-row-label--accent">
                  <Download size={13} strokeWidth={2} aria-hidden="true" />
                  {downloadLabel}
                </span>
              </button>
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
      )}
    </div>
  );
}
