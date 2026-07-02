/**
 * Hairline chrome strings — centralized fixed UI copy.
 *
 * This is a plain data module: no i18n framework, no runtime lookup, no
 * npm library. It exists for two reasons (see docs/HAIRLINE_WORKPLAN.md
 * W0.3):
 *   1. Re-skin necessity — fixed Hairline copy previously lived scattered
 *      across components; this gives every future screen one place to
 *      import it from.
 *   2. Future i18n seam — a later Spanish-localization project keys off
 *      this module instead of grepping components for hardcoded strings.
 *
 * Source of truth: Picasso/design/hairline/DESIGN_SPEC.md (Turn 10 master
 * set), cross-checked against the original bundle
 * `design/hairline/bundle/Chat Widget Redesigns.dc.html` per the mapping
 * doc's §0 fidelity rule (bundle prevails on any discrepancy). Every value
 * below is copied verbatim — do not edit copy here without updating the
 * design spec first.
 *
 * Rules:
 *   - Sentence case is stored as-is. Caps rendering (header wordmark,
 *     thread sender labels) is a CSS `text-transform` concern for the
 *     component that renders it — never bake caps into the string value.
 *   - Tenant-configurable copy does NOT belong here: chat_title,
 *     welcome_message, action_chips.default_chips labels, cta_definitions
 *     labels, quick_help.prompts, privacy_notice_url. Those come from the
 *     tenant config, not this module.
 *   - This module has no consumers yet (see W0.3 done-when criteria) —
 *     later items (W2.x/W3.x) import from here as they build each screen.
 */

export const strings = {
  // DESIGN_SPEC.md "1. Welcome (`10a Welcome`)"
  welcome: {
    greeting: 'Hi there 👋',
    // Fixed row appended to the tenant's action_chips menu card.
    commonQuestionsRow: 'Common questions',
  },

  // DESIGN_SPEC.md "2. Common questions (`10a Common questions`)"
  questionsOverlay: {
    title: 'Common questions',
  },

  // DESIGN_SPEC.md "Composer states (`10b`...)" — Idle
  composer: {
    placeholder: 'Ask a question…',
  },

  // DESIGN_SPEC.md "Composer states" — Attach menu
  attachMenu: {
    photoOrVideo: 'Photo or video',
    file: 'File',
  },

  // DESIGN_SPEC.md "Composer states" — Photo attached (chip status suffix;
  // the size value itself, e.g. "2.4 MB", is computed, not fixed copy)
  attachmentChip: {
    readyToSend: 'ready to send',
  },

  // DESIGN_SPEC.md "4. Feedback given (`10a Feedback given`)"
  responseActions: {
    copied: 'Copied',
  },

  // DESIGN_SPEC.md "5. Settings (`10a Settings`)"
  settings: {
    pageTitle: 'Settings',
    groups: {
      conversation: 'Conversation',
      preferences: 'Preferences',
      yourData: 'Your data',
    },
    rows: {
      currentSession: 'Current session',
      history: 'History',
      // Empty-state value shown when no past conversations exist.
      historyEmpty: 'None yet',
      connection: 'Connection',
      // The two fixed values the Connection row's status can show.
      connectionOnline: 'Online',
      connectionOffline: 'Offline',
      offlineSync: 'Offline sync',
      storage: 'Storage',
      storageValue: 'Session · clears on close',
      downloadConversations: 'Download conversations',
      privacyAndCompliance: 'Privacy & compliance',
    },
    clearAllMessages: 'Clear all messages',
    clearAllMessagesFinePrint: "Logged for audit compliance · can't be undone",
  },

  // DESIGN_SPEC.md "6. Privacy & compliance (`10a Privacy`)"
  privacy: {
    pageTitle: 'Privacy & compliance',
    checklist: {
      encryptedInTransit: 'All data is encrypted in transit',
      auditLogging: 'Audit logging for compliance',
      retentionVaries: 'Retention varies by data type',
    },
    finePrint:
      'Exports include conversation metadata and statistics only — message content is never included. See the privacy notice for retention details.',
    // The "privacy notice" substring within finePrint above is a link to
    // config.privacy_notice_url; kept separately so a consumer can splice
    // the fine print around the link.
    privacyNoticeLinkText: 'privacy notice',
  },

  // DESIGN_SPEC.md Typography table "Powered-by" row + every screen mock's footer
  footer: {
    poweredByPrefix: 'Powered by',
    brandName: 'MyRecruiter',
  },
};

export default strings;
