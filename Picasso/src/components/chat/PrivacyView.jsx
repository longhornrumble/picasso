// src/components/chat/PrivacyView.jsx
//
// Hairline redesign (W3.4): Privacy & compliance full-widget takeover.
//
// DESIGN_SPEC.md screen 6 — one bordered checklist card (3 fixed compliance
// facts) + one paragraph of fine print linking to the tenant's own privacy
// policy. Opened from SettingsView's "Privacy & compliance" row; rendered by
// ChatWidget.jsx as a REPLACEMENT for SettingsView within the same
// `showStateManagement` gate (mutually exclusive at render time, not stacked
// on top of it — see ChatWidget.jsx's render comment for why: it keeps ESC
// handling to one listener at a time, so a single ESC press pops exactly one
// level, matching "back returns to settings").
//
// NEW config read (HAIRLINE_REDESIGN_MAPPING.md §7 D9): `privacy_notice_url`
// is the tenant's link to their full privacy policy. It doesn't exist on any
// tenant config yet (net-new field, populated per-tenant at the P6 flip via
// a direct Config_Manager PUT — the config-builder authoring UI is a
// separate project). Forward-compatible read per CLAUDE.md's Schema
// Discipline rule: `config?.privacy_notice_url`, tolerant of the field being
// entirely absent (every config today) — never crashes on the old shape.
//
// Judgment call (flagged in the PR for sign-off, same convention as W3.3's
// PR): DESIGN_SPEC.md's fine print is one sentence of general compliance
// copy followed by a second sentence that exists ONLY to introduce the
// "privacy notice" link ("See the privacy notice for retention details.").
// There is no mocked degraded state for a missing link (net-new field, no
// Turn 10 mock covers it). Splicing just the link out and leaving the
// surrounding sentence reads as a dangling promise ("See the  for retention
// details."), so this component hides the ENTIRE fine-print paragraph when
// the field is absent rather than render a broken half-sentence — the
// checklist card alone still stands on its own as useful compliance copy.
import React, { useEffect, useRef } from "react";
import { Check, ChevronLeft, X } from "lucide-react";
import { useConfig } from "../../hooks/useConfig";
import strings from "../../i18n/strings";

/** Focus trap: keeps Tab/Shift+Tab cycling within `containerRef`'s focusable
 * elements while this takeover is open. Duplicated from SettingsView.jsx
 * (not exported there) — same small hook, kept local per "own only your
 * files" (HAIRLINE_WORKPLAN.md ground rule #3). */
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

export default function PrivacyView({ onBack, onClose }) {
  const { config } = useConfig();
  const rootRef = useRef(null);
  const backButtonRef = useRef(null);

  // A11y (HAIRLINE_WORKPLAN.md ground rule #7): focus moves into the
  // takeover on mount; ESC returns to Settings (same pattern as
  // SettingsView.jsx).
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

  const privacyNoticeUrl = config?.privacy_notice_url;
  const { storageDisclosure, noticeSentence, privacyNoticeLinkText } = strings.privacy;
  const noticeParts = privacyNoticeUrl ? noticeSentence.split(privacyNoticeLinkText) : null;
  // Defensive: only render the spliced notice sentence if the link text was
  // actually found inside it (a future copy change to strings.js shouldn't
  // be able to render a broken/undefined fragment — tolerant read applies to
  // our own copy module too, not just the tenant config). The storage
  // disclosure itself renders unconditionally — before this split, tenants
  // without privacy_notice_url showed no explanation at all (Chris,
  // 2026-07-03).
  const showNoticeSentence = Boolean(privacyNoticeUrl) && noticeParts?.length === 2;

  const checklistItems = [
    strings.privacy.checklist.encryptedInTransit,
    strings.privacy.checklist.auditLogging,
    strings.privacy.checklist.retentionVaries,
  ];

  return (
    <div
      ref={rootRef}
      className="hairline-privacy-view"
      role="dialog"
      aria-modal="true"
      aria-label={strings.privacy.pageTitle}
    >
      <div className="hairline-takeover-header">
        <div className="hairline-takeover-header-left">
          <button
            ref={backButtonRef}
            type="button"
            className="hairline-icon-button"
            onClick={onBack}
            aria-label="Back to settings"
          >
            <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <h3 className="hairline-page-title">{strings.privacy.pageTitle}</h3>
        </div>
        <button type="button" className="hairline-icon-button" onClick={onClose} aria-label="Close chat">
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="hairline-privacy-content">
        <div className="hairline-privacy-checklist">
          {checklistItems.map((label) => (
            <div key={label} className="hairline-privacy-checklist-row">
              <Check
                size={13}
                strokeWidth={2.5}
                className="hairline-privacy-checklist-icon"
                aria-hidden="true"
              />
              <span className="hairline-privacy-checklist-text">{label}</span>
            </div>
          ))}
        </div>

        <p className="hairline-privacy-fine-print">
          {storageDisclosure}
          {showNoticeSentence && (
            <>
              {" "}
              {noticeParts[0]}
              <a
                href={privacyNoticeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hairline-privacy-link"
              >
                {privacyNoticeLinkText}
              </a>
              {noticeParts[1]}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
