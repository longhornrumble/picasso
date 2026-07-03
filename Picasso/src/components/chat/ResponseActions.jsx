// ResponseActions.jsx — copy + thumbs row under completed bot replies (W2.6)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import strings from "../../i18n/strings";

// DESIGN_SPEC.md "4. Feedback given" — the "Copied" confirmation shows for
// ~2s then fades.
const COPIED_CONFIRM_MS = 2000;

/**
 * Strip a sanitized-HTML reply down to plain text for clipboard copy.
 *
 * `html` arrives already DOMPurify-sanitized by MessageBubble's finalized-
 * message render path (see MessageBubble.jsx's props-contract comment) — it
 * is safe to parse into a detached, unattached DOM node purely to read
 * `textContent`. This never touches the live sanitizer pipeline or the
 * streaming writer (both frozen per HAIRLINE_WORKPLAN.md ground rule #2).
 */
function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  if (typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.textContent || container.innerText || "").trim();
}

/**
 * ResponseActions — DESIGN_SPEC.md screens 3/4 ("Response actions" /
 * "Feedback given"): copy · thumbs-up · thumbs-down row rendered under every
 * completed (non-streaming) bot reply.
 *
 * - Copy is FUNCTIONAL: Clipboard API on the reply's plain text, "Copied"
 *   confirm ~2s, graceful no-op if the Clipboard API is unavailable or
 *   denied (never throws).
 * - Thumbs are INERT per decision D3 (Chris, hairline session): a local,
 *   mutually-exclusive visual toggle only. The feedback backend (POST with
 *   message id) is W5.1, a post-flip fast-follow gated on a PII/AI-
 *   governance advisory pass (the feedback feeds an "LLM improvement loop").
 *   Do NOT add a network call here — see the `// W5.1` markers below.
 */
export default function ResponseActions({ replyHtml }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null); // null | 'up' | 'down'
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      // Clipboard API unavailable (unsupported browser, insecure context,
      // permissions policy) — fail gracefully, no crash, no confirmation.
      return;
    }

    const text = htmlToPlainText(replyHtml);
    try {
      await clipboard.writeText(text);
    } catch (err) {
      // Permission denied or write failure — fail gracefully.
      return;
    }

    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), COPIED_CONFIRM_MS);
  }, [replyHtml]);

  const handleThumbUp = useCallback(() => {
    // W5.1: thumbs feedback backend (post-flip fast-follow) — no POST yet
    setFeedback((prev) => (prev === "up" ? null : "up"));
  }, []);

  const handleThumbDown = useCallback(() => {
    // W5.1: thumbs feedback backend (post-flip fast-follow) — no POST yet
    setFeedback((prev) => (prev === "down" ? null : "down"));
  }, []);

  return (
    <div className="hairline-response-actions">
      <button
        type="button"
        className="hairline-response-action-btn"
        onClick={handleCopy}
        title={strings.responseActions.copy}
        aria-label={strings.responseActions.copy}
      >
        {copied ? (
          <Check size={13} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Copy size={13} strokeWidth={2} aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className={`hairline-response-action-btn${feedback === "up" ? " hairline-response-action-btn--active" : ""}`}
        onClick={handleThumbUp}
        aria-pressed={feedback === "up"}
        title={strings.responseActions.goodResponse}
        aria-label={strings.responseActions.goodResponse}
      >
        <ThumbsUp
          size={13}
          strokeWidth={2}
          fill={feedback === "up" ? "var(--tenant-accent)" : "none"}
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        className={`hairline-response-action-btn${feedback === "down" ? " hairline-response-action-btn--active" : ""}`}
        onClick={handleThumbDown}
        aria-pressed={feedback === "down"}
        title={strings.responseActions.badResponse}
        aria-label={strings.responseActions.badResponse}
      >
        <ThumbsDown
          size={13}
          strokeWidth={2}
          fill={feedback === "down" ? "var(--tenant-accent)" : "none"}
          aria-hidden="true"
        />
      </button>

      {copied && (
        <span className="hairline-response-copied" role="status">
          {strings.responseActions.copied}
        </span>
      )}
    </div>
  );
}
