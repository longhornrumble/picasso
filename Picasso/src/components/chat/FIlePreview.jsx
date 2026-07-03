// src/components/chat/FilePreview.jsx
//
// Hairline redesign: attachment chip (W2.5) + in-thread sent-attachment
// preview (W4.4).
//
// Scope boundary (docs/HAIRLINE_WORKPLAN.md W2.5 / W4.4): this file has two
// render paths. The image/video/PDF inline-preview branches below
// (`.hairline-attachment-preview-media--image/video/pdf`, styled in
// hairline-attachments.css) are the "sent attachment rendered in-thread"
// surface — W4.4's scope, an unmocked capability
// (HAIRLINE_REDESIGN_MAPPING.md §4 item 5) restyled fresh in the Hairline
// vocabulary (hairline-card border/radius, ink/tenant tokens) per the
// fidelity rule §0 case 2 — no Turn 10 mock exists for this surface. The
// fallback "file card" branch — the icon + filename + size/status + remove
// chip used for in-flight uploads, errored uploads, and any
// non-previewable file type — is W2.5's DESIGN_SPEC.md "Photo attached"
// chip anatomy and is untouched by this pass.
//
// Runtime-reachability note (flagged, not fixed — frozen functionality):
// both StreamingChatProvider.addMessage and HTTPChatProvider.addMessage
// currently drop `message.files` before sendMessage, so a sent attachment
// never actually reaches the live thread today — this whole in-thread
// preview path is unreachable at runtime until that provider bug is fixed
// (separate item, out of W4.4's scope). Restyled anyway so it's correct the
// moment that bug is fixed; verified via a static/mirrored-markup harness
// instead of the live dev harness (see PR description).
//
// Entanglement note: today, selecting a file in AttachmentMenu.jsx posts it
// immediately via addMessage (no staged pre-send state), so an attached
// *image* renders straight into the rich inline-preview branch below rather
// than this chip — only non-previewable files (or an explicit `uploading`/
// `error` uploadState) take the chip path. Reproducing the mock's "photo
// attached, ready to send" chip pixel-for-pixel for images specifically
// would require a genuine pre-send staging state in InputBar.jsx, which is
// out of this item's file ownership (frozen, W2.4). Flagged in the PR
// rather than worked around.
import React from "react";
import { FileText, Image, Video, Music, Archive, File, AlertCircle, X } from "lucide-react";
import strings from "../../i18n/strings";

export default function FilePreview({ file, uploadState = "complete", onCancel }) {
  // Helper function to check if file is an image
  const isImage = file?.type && typeof file.type === 'string' && file.type.startsWith('image/');

  // Chip thumb icon by file type (DESIGN_SPEC.md "Photo attached": "32px
  // radius-8 ... thumb slot with image icon" — icon-based, not a text label).
  const getFileTypeIcon = (mimeType) => {
    const iconProps = { size: 16, strokeWidth: 2 };
    if (!mimeType) return <File {...iconProps} />;

    if (mimeType.startsWith('image/')) return <Image {...iconProps} />;
    if (mimeType.startsWith('video/')) return <Video {...iconProps} />;
    if (mimeType.startsWith('audio/')) return <Music {...iconProps} />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <Archive {...iconProps} />;
    if (
      mimeType.includes('pdf') ||
      mimeType.includes('word') ||
      mimeType.includes('document') ||
      mimeType.includes('sheet') ||
      mimeType.includes('excel') ||
      mimeType.includes('text')
    ) {
      return <FileText {...iconProps} />;
    }

    return <File {...iconProps} />;
  };

  // Helper function to get status text based on upload state
  const getStatusText = () => {
    switch (uploadState) {
      case 'uploading':
        return file?.progress ? `Uploading… ${file.progress}%` : 'Uploading…';
      case 'error':
        return 'Upload failed';
      case 'complete':
      default:
        return file?.size
          ? `${formatFileSize(file.size)} · ${strings.attachmentChip.readyToSend}`
          : strings.attachmentChip.readyToSend;
    }
  };

  // Helper function to format file size (matches DESIGN_SPEC.md's
  // "2.4 MB" one-decimal precision for the MB range).
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getChipClass = () => {
    switch (uploadState) {
      case 'uploading':
        return 'hairline-attachment-chip hairline-attachment-chip--uploading';
      case 'error':
        return 'hairline-attachment-chip hairline-attachment-chip--error';
      case 'complete':
      default:
        return 'hairline-attachment-chip hairline-attachment-chip--complete';
    }
  };

  return (
    <div className="hairline-attachment-preview">
      {/* Image Preview — W4.4: hairline-card anatomy (border/radius/tint),
          no Turn 10 mock (fresh Hairline treatment). */}
      {isImage && uploadState === 'complete' ? (
        <div className="hairline-attachment-preview-media hairline-attachment-preview-media--image">
          {file.url ? (
            <img
              src={file.url}
              alt={file.name}
            />
          ) : (
            <div className="hairline-attachment-preview-placeholder">
              <Image size={20} strokeWidth={2} className="hairline-attachment-preview-placeholder-icon" />
              <span>{file.name}</span>
            </div>
          )}
        </div>
      ) : (file.type && typeof file.type === 'string' && file.type.startsWith('video/')) && uploadState === 'complete' ? (
        <div className="hairline-attachment-preview-media hairline-attachment-preview-media--video">
          <video
            src={file.url}
            controls
          />
        </div>
      ) : (file.type && typeof file.type === 'string' && file.type.includes('pdf')) && uploadState === 'complete' ? (
        <div className="hairline-attachment-preview-media hairline-attachment-preview-media--pdf">
          <iframe
            src={file.url}
            title={file.name}
            onError={(e) => {
              e.target.outerHTML = `<div class="hairline-attachment-preview-error">Unable to preview PDF. Please download the file instead.</div>`;
            }}
          />
        </div>
      ) : (
        /* Attachment chip — DESIGN_SPEC.md "Photo attached": thumb slot,
           filename, size/status, remove. Covers uploading/error states and
           any complete-but-non-previewable file type. */
        <div className={getChipClass()}>
          <div className="hairline-attachment-chip-thumb" aria-hidden="true">
            {uploadState === 'error' ? (
              <AlertCircle size={16} strokeWidth={2} />
            ) : (
              getFileTypeIcon(file.type)
            )}
          </div>

          <div className="hairline-attachment-chip-info">
            <div className="hairline-attachment-chip-name">{file.name}</div>
            <div
              className="hairline-attachment-chip-status"
              role="status"
              aria-live="polite"
            >
              {getStatusText()}
            </div>

            {/* Progress bar while uploading */}
            {uploadState === 'uploading' && (
              <div className="hairline-attachment-chip-progress">
                <div
                  className="hairline-attachment-chip-progress-fill"
                  style={{ '--progress-width': file.progress ? `${file.progress}%` : '10%' }}
                />
              </div>
            )}
          </div>

          {/* Remove — DESIGN_SPEC.md's chip always offers a way to remove;
              gated on `onCancel` being supplied so callers that don't wire
              it up see no behavior change. */}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="hairline-attachment-chip-remove"
              aria-label={`Remove ${file.name}`}
            >
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}