// Hairline redesign (W6.3 audit fix F2) — powered-by attribution line.
//
// DESIGN_SPEC.md Typography table "Powered-by" row + screen 1 footer:
// "Powered by [16px MyRecruiter icon] MyRecruiter", centered beneath the
// composer — prefix 9.5px/400 `--ink-ghost`, brand name 10px/700 #8f8871.
// Styles live in hairline-composer.css (`.hairline-footer*`).
//
// The MyRecruiter mark is a BUNDLED asset (`public/myrecruiter-mark.png`,
// copied to the dist root by esbuild.config.mjs) per DESIGN_SPEC.md
// "Assets": "real logo asset to be bundled — do not hotlink". This
// replaces the old hardcoded prod-S3 `MyRecruiterLogo.png` hotlink (the
// 107×20 full-wordmark image), which doubled as the brand name and stayed
// in the old widget's visual idiom. The mark is decorative (alt="") —
// the brand name is always present as text, so a failed image load
// degrades gracefully without JS error handling.
//
// Platform attribution is fixed copy (never tenant-configurable — same
// policy as the old component); strings from src/i18n/strings.js.
import React from "react";
import strings from "../../i18n/strings";

export default function ChatFooter() {
  return (
    <div className="hairline-footer">
      <span className="hairline-footer-powered">{strings.footer.poweredByPrefix}</span>
      <img className="hairline-footer-mark" src="/myrecruiter-mark.png" alt="" aria-hidden="true" />
      <span className="hairline-footer-brand">{strings.footer.brandName}</span>
    </div>
  );
}
