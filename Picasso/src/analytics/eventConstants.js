/**
 * Analytics Event Constants
 *
 * Event types and schema definitions for User Journey Analytics.
 * See: /docs/User_Journey/USER_JOURNEY_ANALYTICS_PLAN.md
 *
 * @version 1.0.0
 */

// Schema version - use envelope pattern for future evolution
export const SCHEMA_VERSION = '1.0.0';

// ============================================================================
// WIDGET LIFECYCLE EVENTS
// ============================================================================

/**
 * Widget opened by user
 * Payload: { trigger: 'button' | 'callout' | 'auto' }
 */
export const WIDGET_OPENED = 'WIDGET_OPENED';

/**
 * Widget closed by user
 * Payload: { dwell_time_seconds: number }
 */
export const WIDGET_CLOSED = 'WIDGET_CLOSED';

/**
 * First message sent in session
 * Payload: {} (no additional fields needed)
 */
export const CONVERSATION_STARTED = 'CONVERSATION_STARTED';

// ============================================================================
// ITEM CLICK EVENTS
// ============================================================================

/**
 * Action chip clicked
 * Payload: { chip_id: string, chip_label: string, target_branch: string | null }
 */
export const ACTION_CHIP_CLICKED = 'ACTION_CHIP_CLICKED';

/**
 * CTA button clicked
 * Payload: { cta_id: string, cta_label: string, cta_action: string, triggers_form: boolean }
 */
export const CTA_CLICKED = 'CTA_CLICKED';

/**
 * Link clicked within message content
 * Payload: { url: string, link_text: string, link_domain: string, category: string }
 */
export const LINK_CLICKED = 'LINK_CLICKED';

/**
 * Help menu item clicked
 * Payload: { prompt_index: number, prompt_text: string }
 */
export const HELP_MENU_CLICKED = 'HELP_MENU_CLICKED';

/**
 * Showcase card CTA clicked
 * Payload: { showcase_id: string, cta_type: 'primary' | 'secondary' }
 */
export const SHOWCASE_CTA_CLICKED = 'SHOWCASE_CTA_CLICKED';

// ============================================================================
// FORM EVENTS (Critical for Forms Dashboard)
// ============================================================================

/**
 * Form displayed to user
 * Payload: { form_id: string, form_label: string, trigger_source: string }
 */
export const FORM_VIEWED = 'FORM_VIEWED';

/**
 * User began filling form (first field focused)
 * Payload: { form_id: string, field_count: number, start_time: string }
 */
export const FORM_STARTED = 'FORM_STARTED';

/**
 * Individual field completed
 * Payload: { form_id: string, field_id: string, field_label: string, field_index: number }
 */
export const FORM_FIELD_SUBMITTED = 'FORM_FIELD_SUBMITTED';

/**
 * Form submitted successfully
 * Payload: { form_id: string, duration_seconds: number, fields_completed: number }
 */
export const FORM_COMPLETED = 'FORM_COMPLETED';

/**
 * Form abandoned (closed/timeout/navigated away)
 * Payload: {
 *   form_id: string,
 *   form_label: string,
 *   last_field_id: string,
 *   last_field_label: string,
 *   last_field_index: number,
 *   fields_completed: number,
 *   total_fields: number,
 *   duration_seconds: number,
 *   reason: 'closed' | 'timeout' | 'navigated'
 * }
 */
export const FORM_ABANDONED = 'FORM_ABANDONED';

// ============================================================================
// MESSAGE EVENTS (for conversation tracking)
// ============================================================================

/**
 * User sent a message
 * Payload: { content_length: number, content_preview: string }
 */
export const MESSAGE_SENT = 'MESSAGE_SENT';

/**
 * Bot response received
 * Payload: { content_length: number, response_time_ms: number, ctas_shown: string[], branch_id: string }
 */
export const MESSAGE_RECEIVED = 'MESSAGE_RECEIVED';

// ============================================================================
// EVENT CATEGORIES (for filtering and routing)
// ============================================================================

export const EVENT_CATEGORIES = {
  LIFECYCLE: [WIDGET_OPENED, WIDGET_CLOSED, CONVERSATION_STARTED],
  CLICKS: [ACTION_CHIP_CLICKED, CTA_CLICKED, LINK_CLICKED, HELP_MENU_CLICKED, SHOWCASE_CTA_CLICKED],
  FORMS: [FORM_VIEWED, FORM_STARTED, FORM_FIELD_SUBMITTED, FORM_COMPLETED, FORM_ABANDONED],
  MESSAGES: [MESSAGE_SENT, MESSAGE_RECEIVED]
};

// All analytics event types
export const ALL_EVENT_TYPES = [
  ...EVENT_CATEGORIES.LIFECYCLE,
  ...EVENT_CATEGORIES.CLICKS,
  ...EVENT_CATEGORIES.FORMS,
  ...EVENT_CATEGORIES.MESSAGES
];

// ============================================================================
// EVENT ENVELOPE FACTORY
// ============================================================================

/**
 * Creates an analytics event with the envelope pattern for schema versioning.
 *
 * @param {Object} params - Event parameters
 * @param {string} params.eventType - One of the event type constants
 * @param {Object} params.payload - Event-specific payload data
 * @param {string} params.sessionId - Current session ID
 * @param {string} params.tenantHash - Tenant identifier
 * @param {number} params.stepNumber - Event sequence number within session
 * @param {string} [params.gaClientId] - GA4 client ID for session stitching (optional)
 * @returns {Object} Fully-formed analytics event
 *
 * @example
 * const event = createAnalyticsEvent({
 *   eventType: FORM_STARTED,
 *   payload: { form_id: 'volunteer_app', field_count: 5, start_time: new Date().toISOString() },
 *   sessionId: 'sess_abc123',
 *   tenantHash: 'fo85e6a06dcdf4',
 *   stepNumber: 3,
 *   gaClientId: '123456789.1702900000'
 * });
 */
export function createAnalyticsEvent({
  eventType,
  payload,
  sessionId,
  tenantHash,
  stepNumber,
  gaClientId = null
}) {
  if (!ALL_EVENT_TYPES.includes(eventType)) {
    console.warn(`[Analytics] Unknown event type: ${eventType}`);
  }

  const event = {
    schema_version: SCHEMA_VERSION,
    tenant_id: tenantHash,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    step_number: stepNumber,
    event: {
      type: eventType,
      payload: payload || {}
    }
  };

  // Add GA4 client ID if available (for attribution stitching)
  if (gaClientId) {
    event.ga_client_id = gaClientId;
  }

  return event;
}

// ============================================================================
// ATTRIBUTION DATA STRUCTURE
// ============================================================================

/**
 * Creates attribution data captured from the parent page.
 * Called by widget-host.js on initialization.
 *
 * @param {Object} params - Attribution parameters
 * @param {string} [params.gaClientId] - GA4 client ID from _ga cookie
 * @param {string} [params.utmSource] - UTM source parameter
 * @param {string} [params.utmMedium] - UTM medium parameter
 * @param {string} [params.utmCampaign] - UTM campaign parameter
 * @param {string} [params.utmTerm] - UTM term parameter
 * @param {string} [params.utmContent] - UTM content parameter
 * @param {string} [params.referrer] - Document referrer
 * @param {string} [params.landingPage] - Landing page pathname
 * @returns {Object} Attribution data object
 */
export function createAttributionData({
  gaClientId = null,
  utmSource = null,
  utmMedium = null,
  utmCampaign = null,
  utmTerm = null,
  utmContent = null,
  referrer = null,
  landingPage = null
} = {}) {
  return {
    ga_client_id: gaClientId,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_term: utmTerm,
    utm_content: utmContent,
    referrer: referrer,
    landing_page: landingPage,
    captured_at: new Date().toISOString()
  };
}

// ============================================================================
// FORM ABANDON REASONS
// ============================================================================

export const FORM_ABANDON_REASONS = {
  CLOSED: 'closed',      // User closed the widget
  TIMEOUT: 'timeout',    // Session timed out (30 min inactivity)
  NAVIGATED: 'navigated' // User navigated away or started new conversation
};

// ============================================================================
// WIDGET OPEN TRIGGERS
// ============================================================================

export const WIDGET_OPEN_TRIGGERS = {
  BUTTON: 'button',   // User clicked the floating button
  CALLOUT: 'callout', // User clicked the callout bubble
  AUTO: 'auto'        // Widget auto-opened (if configured)
};

// ============================================================================
// CTA ACTION TYPES (for CTA_CLICKED events)
// ============================================================================

export const CTA_ACTION_TYPES = {
  FORM_TRIGGER: 'form_trigger',     // Opens a conversational form
  EXTERNAL_LINK: 'external_link',   // Opens external URL
  INTERNAL_LINK: 'internal_link',   // Opens internal URL
  BRANCH_TRIGGER: 'branch_trigger', // Triggers conversation branch
  PHONE: 'phone',                   // Phone link (tel:)
  EMAIL: 'email'                    // Email link (mailto:)
};

export default {
  // Schema
  SCHEMA_VERSION,

  // Lifecycle events
  WIDGET_OPENED,
  WIDGET_CLOSED,
  CONVERSATION_STARTED,

  // Click events
  ACTION_CHIP_CLICKED,
  CTA_CLICKED,
  LINK_CLICKED,
  HELP_MENU_CLICKED,
  SHOWCASE_CTA_CLICKED,

  // Form events
  FORM_VIEWED,
  FORM_STARTED,
  FORM_FIELD_SUBMITTED,
  FORM_COMPLETED,
  FORM_ABANDONED,

  // Message events
  MESSAGE_SENT,
  MESSAGE_RECEIVED,

  // Categories and helpers
  EVENT_CATEGORIES,
  ALL_EVENT_TYPES,
  createAnalyticsEvent,
  createAttributionData,

  // Enums
  FORM_ABANDON_REASONS,
  WIDGET_OPEN_TRIGGERS,
  CTA_ACTION_TYPES
};
