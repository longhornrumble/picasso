// src/components/chat/InputBar.jsx - FIXED inline send button alignment
import React, { useState, useRef, useEffect } from "react";
import { useChat } from "../../hooks/useChat";
import { useConfig } from "../../hooks/useConfig";
import { useFormMode } from "../../context/FormModeContext";
import { Plus, ArrowRight, Mic } from "lucide-react";
import AttachmentMenu from "./AttachmentMenu";

export default function InputBar({ input, setInput }) {
  const { addMessage, isTyping } = useChat();
  const { config } = useConfig();
  const { isFormMode, suspendForm } = useFormMode();
  const features = config?.features || {};
  const [showAttachments, setShowAttachments] = useState(false);
  const [_uploadingFiles, setUploadingFiles] = useState(new Set());
  const textareaRef = useRef(null);

  const [localInput, setLocalInput] = useState("");
  const actualInput = input !== undefined ? input : localInput;
  const actualSetInput = setInput || setLocalInput;

  const fontFamily = config?.branding?.font_family || "system-ui, sans-serif";

  // Adjust textarea height based on its content
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const span = document.createElement("span");
    span.style.font = window.getComputedStyle(textarea).font;
    span.style.fontSize = config?.branding?.font_size || "15px";
    span.style.fontFamily = fontFamily;
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    span.style.whiteSpace = "nowrap";
    span.textContent = textarea.value || textarea.placeholder;

    document.body.appendChild(span);
    const textWidth = span.offsetWidth;
    document.body.removeChild(span);

    const textareaStyles = window.getComputedStyle(textarea);
    const paddingLeft = parseInt(textareaStyles.paddingLeft) || 0;
    const paddingRight = parseInt(textareaStyles.paddingRight) || 0;
    const availableWidth = textarea.offsetWidth - paddingLeft - paddingRight;

    if (textWidth > availableWidth) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 120;
      textarea.style.height = Math.min(scrollHeight, maxHeight) + "px";
    } else {
      textarea.style.height = "20px";
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [actualInput]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "20px";
    }
  }, []);

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

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "20px";
      }
    }, 0);
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

  const hasBottomRow = features.uploads || features.photo_uploads || features.voice_input;

  return (
    <div className={`input-bar-container ${hasBottomRow ? "double-row" : "single-row"}`}>
      {showAttachments && (
        <AttachmentMenu onClose={() => setShowAttachments(false)} />
      )}

      <div className="input-row-container">
        <div className={`input-text-row ${!hasBottomRow ? "inline-mode" : ""}`}>
          {!hasBottomRow ? (
            // FIXED: Single row with inline send button
            <div className="input-inline-container">
              <textarea
                ref={textareaRef}
                id="chat-message-input"
                name="message"
                value={actualInput}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isFormMode ? "Ask me a question (form will pause)..." : "How can I help you today?"}
                autoComplete="off"
                className="input-textarea inline-textarea auto-resize-textarea"
              />
              <button
                onClick={handleSubmit}
                disabled={!actualInput.trim() || isTyping}
                className={`send-button inline-send ${
                  actualInput.trim()
                    ? "send-button-active"
                    : "send-button-disabled"
                }`}
                aria-label="Send"
              >
                <ArrowRight
                  size={16}
                  color={actualInput.trim() ? "white" : "#94a3b8"}
                />
              </button>
            </div>
          ) : (
            // Double row mode - textarea only
            <textarea
              ref={textareaRef}
              id="chat-message-input"
              name="message"
              value={actualInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="How can I help you today?"
              autoComplete="off"
              className="input-textarea"
            />
          )}
        </div>

        {hasBottomRow ? (
          <div className="input-controls-row">
            <div className="input-tools">
              {(features.uploads || features.photo_uploads) && (
                <div
                  className="input-tool-button"
                  onClick={() => setShowAttachments((prev) => !prev)}
                  aria-label="Add Attachment"
                >
                  <Plus size={16} />
                </div>
              )}
              {features.voice_input && (
                <div className="input-tool-button" data-voice>
                  <Mic size={16} />
                </div>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!actualInput.trim() || isTyping}
              className={`send-button ${
                actualInput.trim()
                  ? "send-button-active"
                  : "send-button-disabled"
              }`}
              aria-label="Send"
            >
              <ArrowRight
                size={16}
                color={actualInput.trim() ? "white" : "#94a3b8"}
              />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}