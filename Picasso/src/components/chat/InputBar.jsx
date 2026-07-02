// src/components/chat/InputBar.jsx
//
// Hairline redesign (W2.4): composer idle + expanded states.
//
// Presentation-only rewrite: renders the DESIGN_SPEC.md "Composer states"
// idle pill (+ / placeholder / mic / send) and expanded rect (textarea full
// width, controls drop to a bottom row). The former single-row/double-row
// branching is retired — there is now exactly one pill layout, which
// morphs via a CSS class toggle (`is-expanded`) so the underlying
// <textarea> element never remounts (would drop focus/cursor mid-type).
//
// FROZEN (do not change): the send handler, Enter/Shift+Enter semantics,
// the attach-menu trigger wiring, and the form-mode-interrupts-composer
// logic. See docs/HAIRLINE_WORKPLAN.md W2.4.
import React, { useState, useRef, useEffect } from "react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import { useFormMode } from "../../context/FormModeContext";
import { Plus, ArrowUp, Mic } from "lucide-react";
import AttachmentMenu from "./AttachmentMenu";
import strings from "../../i18n/strings";

// Auto-grow ceiling per DESIGN_SPEC.md "Composer states" > Expanded /
// Interactions & Behavior: "auto-grow up to 4 lines then internal scroll".
const MAX_COMPOSER_LINES = 4;
// Multiplier applied to the measured single-line height to decide whether
// content has wrapped past one line (spec: "when text wraps past one line,
// the pill relaxes to a ... rect"). >1 with headroom absorbs cross-browser
// scrollHeight/lineHeight rounding without falsely tripping on a single line.
const EXPAND_THRESHOLD_MULTIPLIER = 1.4;

export default function InputBar({ input, setInput }) {
  const { addMessage, isTyping } = useChat();
  const { config } = useConfig();
  const { isFormMode, suspendForm } = useFormMode();
  const features = config?.features || {};
  const [showAttachments, setShowAttachments] = useState(false);
  const [_uploadingFiles, setUploadingFiles] = useState(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef(null);

  const [localInput, setLocalInput] = useState("");
  const actualInput = input !== undefined ? input : localInput;
  const actualSetInput = setInput || setLocalInput;

  // Send fill-state: unfilled until there is something to send. W2.5 will
  // extend this with staged-attachment presence once the attach popover
  // produces pending chips (this item ships idle/expanded states only —
  // there is no attachment-staging state yet, so text is the only input).
  const hasContent = actualInput.trim().length > 0;

  const showAttachButton = features.uploads || features.photo_uploads;
  // D4 default: mic renders behind the feature flag but stays inert until
  // W5.2 (voice recording) ships. No MediaRecorder wiring here.
  const showMicButton = !!features.voice_input;

  const placeholder = isFormMode
    ? "Ask me a question (form will pause)..."
    : strings.composer.placeholder;

  const measureLineHeight = (textarea) => {
    const computed = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computed.lineHeight);
    if (!Number.isNaN(lineHeight) && lineHeight > 0) return lineHeight;
    const fontSize = parseFloat(computed.fontSize) || 13.5;
    return fontSize * 1.5;
  };

  // Auto-grow the textarea to content, capping at MAX_COMPOSER_LINES (then
  // internal scroll), and derive the idle-vs-expanded pill state from
  // whether the content needs more than a single line.
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // An empty composer is ALWAYS exactly one line — there is no content that
    // can wrap. Never trust a measured scrollHeight here: on mount the widget
    // iframe's layout/fonts may not be settled, and a mis-read scrollHeight
    // would wrongly size the box tall AND flip the pill to its expanded layout
    // (which only re-derives on input change, so it stays stuck). Reverting to
    // the natural rows={1} height keeps the idle state a true single line.
    if (actualInput.length === 0) {
      textarea.style.height = "";
      textarea.style.overflowY = "hidden";
      setIsExpanded(false);
      return;
    }

    textarea.style.height = "auto";
    const lineHeight = measureLineHeight(textarea);
    const maxHeight = lineHeight * MAX_COMPOSER_LINES;
    const scrollHeight = textarea.scrollHeight;

    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";

    setIsExpanded(scrollHeight > lineHeight * EXPAND_THRESHOLD_MULTIPLIER);
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [actualInput]);

  const handleSubmit = () => {
    const trimmed = actualInput.trim();
    if (!trimmed || isTyping) return;

    // Check if we're in form mode
    if (isFormMode) {
      // Simple approach: Using the bottom input bar during a form is ALWAYS an interruption
      // The user has the form fields above if they want to answer the form question
      // This input is for asking questions or changing their mind
      console.log('[InputBar] Form active - treating input as interruption (question/request):', trimmed);
      suspendForm('user_question');
      addMessage({ role: "user", content: trimmed });
      actualSetInput("");
      setShowAttachments(false);
    } else {
      // Normal chat mode
      addMessage({ role: "user", content: trimmed });
      actualSetInput("");
      setShowAttachments(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e) => {
    actualSetInput(e.target.value);
  };

  const handleMicClick = () => {
    // W5.2 — voice recording capture is a net-new feature (D4). This
    // control renders per features.voice_input but performs no action
    // until that project ships. No MediaRecorder, no state change.
  };

  const cancelUpload = (fileId) => {
    setUploadingFiles((prev) => {
      const newSet = new Set(prev);
      newSet.delete(fileId);
      return newSet;
    });
  };

  const _handleFileSelect = (type) => {
    const inputElem = document.createElement("input");
    inputElem.type = "file";

    switch (type) {
      case "camera":
        inputElem.accept = "image/*";
        inputElem.capture = "environment";
        break;
      case "photo":
        inputElem.accept = "image/*";
        break;
      case "video":
        inputElem.accept = "video/*";
        break;
      case "file":
        inputElem.accept = ".pdf,.doc,.docx,.txt";
        break;
      default:
        break;
    }

    inputElem.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        addMessage({
          role: "user",
          content: `❌ File "${file.name}" is too large (max 10MB)`,
          skipBotResponse: true,
        });
        return;
      }

      const fileId = `upload_${Date.now()}_${Math.random()}`;
      const fileObj = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      if (file.type.startsWith("image/")) {
        try {
          fileObj.preview = URL.createObjectURL(file);
        } catch (error) {
          console.error("Preview error:", error);
        }
      }

      setUploadingFiles((prev) => new Set(prev).add(fileId));

      addMessage({
        id: fileId,
        role: "user",
        content: `Uploading ${file.name}...`,
        files: [fileObj],
        uploadState: "uploading",
        onCancel: () => cancelUpload(fileId),
        skipBotResponse: true,
      });

      setTimeout(() => {
        setUploadingFiles((current) => {
          if (current.has(fileId)) {
            addMessage({
              id: `${fileId}_complete`,
              role: "user",
              content: `📎 ${file.name}`,
              files: [fileObj],
              uploadState: "complete",
              skipBotResponse: true,
              replaceId: fileId,
            });

            const newSet = new Set(current);
            newSet.delete(fileId);
            return newSet;
          }
          return current;
        });
      }, 2000);
    };

    inputElem.click();
    setShowAttachments(false);
  };

  return (
    <div className="hairline-composer">
      {showAttachments && (
        <AttachmentMenu onClose={() => setShowAttachments(false)} />
      )}

      <div
        className={`hairline-composer-pill${isExpanded ? " is-expanded" : ""}`}
      >
        {showAttachButton && (
          <button
            type="button"
            onClick={() => setShowAttachments((prev) => !prev)}
            className="composer-icon-btn composer-attach-btn"
            aria-label="Add Attachment"
            aria-expanded={showAttachments}
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        )}

        <textarea
          ref={textareaRef}
          id="chat-message-input"
          name="message"
          value={actualInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          rows={1}
          className="composer-textarea"
        />

        {showMicButton && (
          <button
            type="button"
            onClick={handleMicClick}
            className="composer-icon-btn composer-mic-btn"
            aria-label="Voice input"
          >
            <Mic size={15} strokeWidth={2} />
          </button>
        )}

        <span className="composer-spacer" aria-hidden="true" />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasContent || isTyping}
          className={`composer-send-btn ${hasContent ? "is-active" : "is-idle"}`}
          aria-label="Send"
        >
          <ArrowUp size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
