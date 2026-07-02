// src/components/chat/AttachmentMenu.jsx
//
// Hairline redesign (W2.5): attach popover.
//
// Presentation-only restyle: DESIGN_SPEC.md "Composer states" > "Attach
// menu" — a two-row popover anchored above-left of the composer's `+`
// button (rendered by InputBar.jsx, which is NOT touched here — see
// docs/HAIRLINE_WORKPLAN.md W2.5). The prior 4-option grid (file / camera /
// photo / video) collapses into the spec's 2 rows; feature-flag gating is
// preserved exactly:
//   - "Photo or video" merges the old photo + camera + video buttons, which
//     were ALL already gated by `features.photo_uploads` — the merge does
//     not change who sees the row, only how many rows it took to show it.
//     The row's file input accepts image/* and video/*, so every capability
//     the three old buttons offered (including camera capture, via the
//     browser/OS's native file-picker chooser) is still reachable.
//   - "File" keeps the old generic-file row, still gated by
//     `features.uploads`.
//
// FROZEN (do not change): accepted file types, feature-flag semantics, and
// the fact that selecting a file posts it immediately via addMessage — see
// the W2.5 PR description for the escalation note on why a true
// staged-before-send chip is out of scope here.
import React, { useEffect, useRef } from "react";
import { Image, FileText } from "lucide-react";
import { useConfig } from "../../hooks/useConfig";
import { useChat } from "../../hooks/useChat";
import strings from "../../i18n/strings";

export default function AttachmentMenu({ onClose }) {
  const { config } = useConfig();
  const features = config?.features || {};
  const { addMessage } = useChat();
  const popoverRef = useRef(null);

  // A11y (HAIRLINE_WORKPLAN.md ground rule #7): new overlays dismiss on
  // ESC and outside-tap.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    const handlePointerDown = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [onClose]);

  // DESIGN_SPEC.md "Attach menu": two rows. Each row's `accept` union
  // preserves every capability the old 4-button grid offered.
  const rows = [
    {
      id: "photo-or-video",
      label: strings.attachMenu.photoOrVideo,
      icon: <Image size={16} strokeWidth={2} aria-hidden="true" />,
      enabled: !!features.photo_uploads,
      accept: "image/*,video/*",
    },
    {
      id: "file",
      label: strings.attachMenu.file,
      icon: <FileText size={16} strokeWidth={2} aria-hidden="true" />,
      enabled: !!features.uploads,
      accept: "*/*",
    },
  ];

  const availableRows = rows.filter((row) => row.enabled);

  // Don't render the popover if no capability is enabled for this tenant.
  if (availableRows.length === 0) {
    return null;
  }

  const handleRowSelect = (row) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = row.accept;

    input.onchange = () => {
      const selectedFiles = Array.from(input.files);
      if (!selectedFiles.length) return;

      const messageFiles = selectedFiles.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      }));

      addMessage({
        role: "user",
        content: `📎 Uploaded ${messageFiles.length > 1 ? "files" : "file"}`,
        files: messageFiles,
      });

      onClose?.();
    };

    input.click();
  };

  return (
    <div
      ref={popoverRef}
      className="hairline-attach-popover"
      role="menu"
      aria-label="Add attachment"
    >
      {availableRows.map((row) => (
        <button
          key={row.id}
          type="button"
          role="menuitem"
          className="hairline-attach-row"
          onClick={() => handleRowSelect(row)}
        >
          <span className="hairline-attach-row-icon">{row.icon}</span>
          <span className="hairline-attach-row-label">{row.label}</span>
        </button>
      ))}
    </div>
  );
}
