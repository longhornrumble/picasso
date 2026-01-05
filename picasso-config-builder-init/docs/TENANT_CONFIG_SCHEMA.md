# Tenant Configuration Schema

**Version**: 1.3
**Last Updated**: 2025-10-15
**Purpose**: Defines the complete configuration structure for multi-tenant Picasso deployments

---

## Overview

The Picasso chat widget is **100% configuration-driven** to support multi-tenant deployments. Each tenant has a unique configuration file stored in S3 that controls:

- Branding and appearance
- Feature availability
- Conversational forms
- Smart response cards and CTAs
- Backend integrations
- Post-submission workflows

This document defines the complete schema for tenant configuration files.

---

## Table of Contents

1. [Core Tenant Identity](#1-core-tenant-identity)
2. [Branding](#2-branding)
3. [Features](#3-features)
4. [Quick Help](#4-quick-help)
5. [Action Chips](#5-action-chips)
6. [Widget Behavior](#6-widget-behavior)
7. [AWS Configuration](#7-aws-configuration)
8. [Card Inventory & Strategy](#8-card-inventory--strategy)
9. [Conversation Branches](#9-conversation-branches)
10. [CTA Definitions](#10-cta-definitions)
11. [Conversational Forms](#11-conversational-forms)
12. [Post-Submission Configuration](#12-post-submission-configuration)
13. [Validation Rules](#13-validation-rules)
14. [Examples](#14-examples)

---

## 1. Core Tenant Identity

**Required fields that identify the tenant and basic metadata.**

```json
{
  "tenant_id": "string",           // Unique identifier (e.g., "MYR384719")
  "tenant_hash": "string",         // Public-facing hash for API calls
  "subscription_tier": "string",   // "Free" | "Standard" | "Premium" | "Enterprise"
  "chat_title": "string",          // Organization name shown in chat header
  "tone_prompt": "string",         // AI personality and response guidelines
  "welcome_message": "string",     // Initial greeting when chat opens
  "callout_text": "string",        // Text shown in widget callout bubble
  "version": "string",             // Config version (e.g., "1.2")
  "generated_at": number,          // Unix timestamp of config generation
  "model_id": "string"             // Bedrock model ID (optional override)
}
```

### Field Details:

- **`tenant_id`** *(required)*: Unique identifier, typically alphanumeric (e.g., `"MYR384719"`)
- **`tenant_hash`** *(required)*: Public-facing hash used in API requests for tenant identification
- **`subscription_tier`** *(required)*: Determines feature availability
- **`chat_title`** *(required)*: Displayed in chat header and widget callout
- **`tone_prompt`** *(required)*: Guides AI personality. Should include:
  - Organization identity
  - Tone/voice (formal, friendly, professional, etc.)
  - Response guidelines (brevity, detail level)
  - Call-to-action preferences
  - Any domain-specific instructions
- **`welcome_message`** *(required)*: First message users see when opening chat
- **`callout_text`** *(optional)*: Text in the floating callout bubble. Defaults to welcome_message if not provided
- **`version`** *(required)*: Semantic version for config tracking
- **`generated_at`** *(required)*: Unix timestamp for cache invalidation
- **`model_id`** *(optional)*: Override default Bedrock model. Uses system default if not specified

---

## 2. Branding

**Visual customization for the chat widget.**

```json
{
  "branding": {
    "logo_background_color": "string",      // Hex color (e.g., "#000000")
    "primary_color": "string",              // Hex color for buttons, links
    "avatar_background_color": "string",    // Hex color for bot avatar background
    "header_text_color": "string",          // Hex color for header text
    "widget_icon_color": "string",          // Hex color for widget icon
    "font_family": "string",                // CSS font family (e.g., "Inter", "Roboto")
    "logo_url": "string",                   // Full URL to organization logo
    "avatar_url": "string"                  // Full URL to bot avatar image
  }
}
```

### Field Details:

- **Colors**: All color values must be valid hex codes (e.g., `"#a1905f"`)
- **`font_family`**: Web-safe font or Google Font name. Will fall back to system fonts if unavailable
- **`logo_url`** / **`avatar_url`**: Publicly accessible URLs (CloudFront, S3, or external CDN)

### Color Guidelines:

- Ensure sufficient contrast for accessibility (WCAG AA minimum)
- `primary_color` should contrast well with white/light backgrounds
- `header_text_color` should contrast with header background

---

## 3. Features

**Feature flags that control widget functionality.**

```json
{
  "features": {
    "uploads": boolean,                     // Enable file uploads
    "photo_uploads": boolean,               // Enable photo/image uploads
    "voice_input": boolean,                 // Enable voice-to-text input
    "streaming": boolean,                   // Enable SSE streaming responses
    "conversational_forms": boolean,        // Enable conversational forms
    "smart_cards": boolean,                 // Enable smart response cards/CTAs
    "callout": {
      "enabled": boolean,                   // Show floating callout bubble
      "text": "string",                     // Custom callout text (overrides root callout_text)
      "auto_dismiss": boolean               // Auto-hide after user interaction
    }
  }
}
```

### Feature Dependencies:

- **`smart_cards`** requires `conversation_branches` and `cta_definitions` to be configured
- **`conversational_forms`** requires `conversational_forms` configuration section
- **`streaming`** should be enabled for optimal UX (falls back to HTTP polling if disabled)

### Subscription Tier Defaults:

| Feature | Free | Standard | Premium | Enterprise |
|---------|------|----------|---------|------------|
| uploads | ❌ | ❌ | ✅ | ✅ |
| photo_uploads | ❌ | ❌ | ✅ | ✅ |
| voice_input | ❌ | ❌ | ✅ | ✅ |
| streaming | ✅ | ✅ | ✅ | ✅ |
| conversational_forms | ❌ | ✅ | ✅ | ✅ |
| smart_cards | ❌ | ✅ | ✅ | ✅ |

---

## 4. Quick Help

**Pre-defined question prompts shown in a help menu.**

```json
{
  "quick_help": {
    "enabled": boolean,                     // Show quick help menu
    "title": "string",                      // Menu header text
    "toggle_text": "string",                // Button text to open/close menu
    "close_after_selection": boolean,       // Auto-close menu after user selects prompt
    "prompts": [                            // Array of quick prompts
      "string"                              // Question text (can include emoji)
    ]
  }
}
```

### Guidelines:

- **Prompts should be 5-8 words max** for best UX
- **Use emoji sparingly** (1 per prompt) for visual clarity
- **Order by popularity** - most common questions first
- **Limit to 6-8 prompts** to avoid overwhelming users

### Example:

```json
{
  "quick_help": {
    "enabled": true,
    "title": "Common Questions",
    "toggle_text": "Help Menu ⬆️",
    "close_after_selection": true,
    "prompts": [
      "👥 Who do you help?",
      "📚 What training do you provide?",
      "⏰ How long is the commitment?",
      "🔍 Do you require background checks?",
      "📍 What areas do you serve?",
      "☎️ How can I contact you?"
    ]
  }
}
```

---

## 5. Action Chips

**Suggested action buttons shown below bot messages.**

```json
{
  "action_chips": {
    "enabled": boolean,                     // Enable action chips
    "max_display": number,                  // Maximum chips to show (1-5)
    "show_on_welcome": boolean,             // Show chips on initial welcome message
    "short_text_threshold": number,         // Character count for layout switch (default: 16)
    "default_chips": [                      // Default chips shown on welcome
      {
        "label": "string",                  // Display text (can include emoji)
        "value": "string"                   // Text sent as user message when clicked
      }
    ]
  }
}
```

### Guidelines:

- **`max_display`**: Recommended 3-4 for mobile, 4-5 for desktop
- **`short_text_threshold`**: Chips with text longer than this use vertical layout
- **Chip labels**: Keep under 30 characters, ideally under 20
- **Use emoji**: Helps with visual scanning and personality

---

## 6. Widget Behavior

**Controls for widget state and interaction behavior.**

```json
{
  "widget_behavior": {
    "start_open": boolean,                  // Open widget automatically on page load
    "remember_state": boolean,              // Remember open/closed state between page loads
    "persist_conversations": boolean,       // Save conversation history locally
    "session_timeout_minutes": number       // Minutes before session expires (default: 30)
  }
}
```

### Recommendations:

- **`start_open: true`** for landing pages where chat is primary CTA
- **`start_open: false`** for general website pages
- **`remember_state: true`** for better UX (avoids re-opening on every page)
- **`persist_conversations: true`** enables conversation continuity across page loads

---

## 7. AWS Configuration

**Backend service configuration for Bedrock and Knowledge Bases.**

```json
{
  "aws": {
    "knowledge_base_id": "string",          // Bedrock Knowledge Base ID
    "aws_region": "string"                  // AWS region (e.g., "us-east-1")
  }
}
```

### Field Details:

- **`knowledge_base_id`**: 10-character alphanumeric ID from Bedrock Knowledge Base
- **`aws_region`**: Must match the region where Knowledge Base is deployed

---

## 8. Card Inventory & Strategy

**Configuration for smart response cards and progressive disclosure strategy.**

```json
{
  "card_inventory": {
    "strategy": "string",                   // "qualification_first" | "exploration_first" | "custom"
    "primary_cta": {
      "type": "string",                     // CTA type identifier
      "title": "string",                    // Display text
      "url": "string",                      // External link (optional)
      "trigger_phrases": ["string"]         // Keywords that trigger this CTA
    },
    "requirements": [                       // Qualification requirements (for qualification_first strategy)
      {
        "type": "string",                   // "age" | "commitment" | "background_check" | "location" | "custom"
        "value": "string",                  // Requirement value (e.g., "22+", "1 year")
        "critical": boolean,                // Is this a deal-breaker?
        "emphasis": "string",               // "low" | "medium" | "high"
        "display_text": "string"            // User-facing text
      }
    ],
    "program_cards": [                      // Available programs/services
      {
        "name": "string",                   // Program name
        "description": "string",            // Brief description
        "commitment": "string",             // Time commitment
        "url": "string"                     // Link to more info
      }
    ],
    "readiness_thresholds": {               // Progressive disclosure thresholds (0.0 - 1.0)
      "show_requirements": number,          // When to show requirements (0.0 = immediately)
      "show_programs": number,              // When to show program options (0.3 = engaged)
      "show_cta": number,                   // When to show action CTAs (0.7 = interested)
      "show_forms": number                  // When to show application forms (0.8 = ready)
    }
  }
}
```

### Strategy Types:

1. **`qualification_first`**: Show requirements early to filter unqualified users
   - Use for: Programs with strict eligibility (age, location, commitment)
   - Example: Foster care volunteering, licensed professionals

2. **`exploration_first`**: Lead with programs/options, show requirements later
   - Use for: Broad appeal programs, general information sites
   - Example: Community events, general volunteering

3. **`custom`**: Define your own progression logic
   - Requires custom conversation branches

### Readiness Thresholds:

- **0.0 - 0.2**: Initial awareness (just opened chat)
- **0.3 - 0.5**: Engaged (asked 2+ questions)
- **0.6 - 0.8**: Interested (asked about specifics)
- **0.9 - 1.0**: Ready to act (expressed intent)

---

## 9. Conversation Branches

**Maps conversation topics to available CTAs for contextual card selection.**

```json
{
  "conversation_branches": {
    "branch_name": {
      "detection_keywords": ["string"],     // Keywords that trigger this branch
      "available_ctas": {
        "primary": "string",                // CTA ID (references cta_definitions)
        "secondary": ["string"]             // Array of CTA IDs
      }
    }
  }
}
```

### Example:

```json
{
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help", "involved", "participate", "join"],
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["view_programs", "schedule_discovery"]
      }
    },
    "program_exploration": {
      "detection_keywords": ["programs", "opportunities", "what do you offer"],
      "available_ctas": {
        "primary": "schedule_discovery",
        "secondary": ["lovebox_info", "daretodream_info"]
      }
    }
  }
}
```

### Guidelines:

- **Keywords should be lowercase** for case-insensitive matching
- **Include variations and synonyms** (e.g., "volunteer", "volunteering", "volunteers")
- **Order branches by priority** in the config (more specific before general)
- **Primary CTA** should be the most relevant action for the conversation topic
- **Secondary CTAs** provide alternative paths (max 2-3)

---

## 10. CTA Definitions

**Reusable call-to-action button definitions referenced by conversation branches.**

```json
{
  "cta_definitions": {
    "cta_id": {
      "text": "string",                     // Button text (legacy)
      "label": "string",                    // Button text (preferred)
      "action": "string",                   // "start_form" | "external_link" | "send_query" | "show_info"
      "formId": "string",                   // Form ID (required if action is "start_form")
      "url": "string",                      // URL (required if action is "external_link")
      "query": "string",                    // Query text (required if action is "send_query")
      "prompt": "string",                   // Prompt text (required if action is "show_info")
      "type": "string",                     // "form_trigger" | "external_link" | "bedrock_query" | "info_request"
      "style": "string"                     // "primary" | "secondary" | "info"
    }
  }
}
```

### Action Types:

1. **`start_form`**: Triggers a conversational form
   - **Required**: `formId` (must match a form in `conversational_forms`)
   - **Effect**: Enters form mode, collects data step-by-step

2. **`external_link`**: Opens external URL in new tab
   - **Required**: `url` (full URL with protocol)
   - **Effect**: Opens link, no form mode

3. **`send_query`**: Sends a predefined query to Bedrock (UX shortcut)
   - **Required**: `query` (the text to send to Bedrock)
   - **Effect**: Sends the specified query as if the user typed it
   - **Use Case**: Provide one-click access to common questions without typing

4. **`show_info`**: Sends a prompt to Bedrock requesting information
   - **Required**: `prompt` (the text to send to Bedrock)
   - **Effect**: Sends the specified prompt to Bedrock for an informational response
   - **Note**: Unlike `send_query`, the prompt is not shown as a user message in the chat. This is useful for information requests where you want Bedrock to provide context without displaying the raw prompt to the user.

### Style Guidelines:

- **`primary`**: Main action, visually prominent (solid color)
- **`secondary`**: Alternative action, less prominent (outline/subtle)
- **`info`**: Informational, lowest priority (text link style)

### Example:

```json
{
  "cta_definitions": {
    "volunteer_apply": {
      "text": "Start Volunteer Application",
      "label": "Start Application",
      "action": "start_form",
      "formId": "volunteer_general",
      "type": "form_trigger",
      "style": "primary"
    },
    "schedule_discovery": {
      "text": "Schedule Discovery Session",
      "label": "Schedule Discovery Session",
      "action": "external_link",
      "url": "https://example.org/schedule",
      "type": "external_link",
      "style": "secondary"
    },
    "lovebox_info": {
      "text": "Learn About Love Box",
      "label": "Learn About Love Box",
      "action": "show_info",
      "prompt": "Tell me about the Love Box program, including eligibility requirements and how to apply",
      "type": "info_request",
      "style": "info"
    },
    "view_requirements": {
      "text": "View Requirements",
      "label": "View Requirements",
      "action": "show_info",
      "prompt": "What are the volunteer requirements for this organization?",
      "type": "info_request",
      "style": "secondary"
    }
  }
}
```

### Send Query vs Show Info:

Both action types send text to Bedrock, but have different behaviors:

- **`send_query`**: Shows the query as a user message in chat, then sends to Bedrock
  - User sees their "question" appear in the chat
  - Good for making CTAs feel like conversational shortcuts
  - Example: "What are your hours?" appears as if the user typed it

- **`show_info`**: Sends prompt to Bedrock without showing it as a user message
  - User only sees Bedrock's response
  - Good for behind-the-scenes context requests
  - Requires explicit `prompt` field (v1.3+)

**Example difference**:
```json
// send_query - visible to user
{
  "label": "Learn More",
  "action": "send_query",
  "query": "Tell me about your volunteer programs and requirements"
}
// Result: User sees "Tell me about your volunteer programs and requirements" in chat, then Bedrock responds

// show_info - invisible to user
{
  "label": "Learn More",
  "action": "show_info",
  "prompt": "Provide a comprehensive overview of all volunteer programs, including requirements, time commitments, and application process"
}
// Result: User only sees Bedrock's response, not the prompt
```

**When to use each**:
- Use `send_query` for conversational shortcuts that feel natural as user questions
- Use `show_info` for information requests where the prompt contains technical instructions or context that shouldn't be visible to users

---

## 11. Conversational Forms

**Multi-step forms collected through natural conversation.**

```json
{
  "conversational_forms": {
    "form_id": {
      "enabled": boolean,                   // Enable this form
      "form_id": "string",                  // Unique form identifier
      "program": "string",                  // Program ID (for completion filtering)
      "title": "string",                    // Form name shown to user
      "description": "string",              // Brief description
      "cta_text": "string",                 // Text for CTA button triggering this form
      "trigger_phrases": ["string"],        // Keywords that can trigger this form
      "fields": [                           // Form fields in order
        {
          "id": "string",                   // Unique field ID (e.g., "first_name")
          "type": "string",                 // Field type (see Field Types below)
          "label": "string",                // Field label
          "prompt": "string",               // Question asked to user
          "hint": "string",                 // Input placeholder/hint (optional)
          "required": boolean,              // Is this field required?
          "options": [                      // For "select" type only
            {
              "value": "string",            // Internal value
              "label": "string"             // Display text
            }
          ],
          "eligibility_gate": boolean,      // If true, "no" ends form gracefully
          "failure_message": "string"       // Message shown if eligibility gate fails
        }
      ],
      "post_submission": {                  // See section 12
        // Post-submission configuration
      }
    }
  }
}
```

### Program Assignment:

The `program` field is **required** (v1.3+) and serves two critical purposes:

1. **Completion Filtering**: Once a form is submitted, CTAs that trigger that form are filtered out based on program matching. This prevents users from seeing "Apply to Love Box" if they've already applied to Love Box.

2. **Program-Based Context**: Allows the system to track which forms belong to which programs, enabling better conversation flow and form recommendations.

**Example**:
```json
{
  "form_id": "lb_apply",
  "program": "lovebox",  // Must match a program ID
  "title": "Love Box Application",
  // ... rest of form config
}
```

**Important Notes**:
- The `program` field must reference a valid program ID (defined in the tenant config)
- Multiple forms can share the same `program` value
- Form completion filtering matches on the exact program string
- Currently, program IDs are also duplicated in Bubble routing rules for notification/integration routing

### Field Types:

| Type | Description | Validation | Input UI |
|------|-------------|------------|----------|
| `text` | Short text input | Max 200 chars | Single-line input |
| `textarea` | Long text input | Max 2000 chars | Multi-line textarea |
| `email` | Email address | RFC 5322 format | Email keyboard on mobile |
| `phone` | Phone number | 10+ digits | Phone keyboard on mobile |
| `select` | Multiple choice | Must match option value | Radio buttons or dropdown |
| `number` | Numeric input | Must be valid number | Numeric keyboard on mobile |
| `date` | Date selection | ISO 8601 format | Date picker |

### Eligibility Gates:

Use `eligibility_gate: true` for fields that determine qualification:

```json
{
  "id": "age_confirm",
  "type": "select",
  "label": "Age Confirmation",
  "prompt": "Are you at least 22 years old?",
  "required": true,
  "options": [
    { "value": "yes", "label": "Yes, I am 22 or older" },
    { "value": "no", "label": "No, I am under 22" }
  ],
  "eligibility_gate": true,
  "failure_message": "Unfortunately, volunteers must be at least 22 years old to participate in this program. However, we have other ways to get involved! Would you like to learn more about our donation opportunities or family support programs?"
}
```

**Behavior**: If user selects "no" on an eligibility gate field:
1. Form exits immediately (doesn't continue to next field)
2. `failure_message` is displayed
3. User returns to normal chat mode

---

## 12. Post-Submission Configuration

**Controls the user experience after form completion. This is NEW in v1.2.**

```json
{
  "post_submission": {
    "confirmation_message": "string",       // Thank you message with placeholders
    "next_steps": ["string"],               // Array of what happens next
    "actions": [                            // User choice buttons
      {
        "id": "string",                     // "end_session" | "continue" | custom
        "label": "string",                  // Button text
        "action": "string"                  // "end_conversation" | "continue_conversation"
      }
    ],
    "fulfillment": {                        // Optional: Backend processing
      "method": "string",                   // "email" | "webhook" | "dynamodb" | "sheets"
      "recipients": ["string"],             // Email addresses (for email method)
      "cc": ["string"],                     // CC email addresses (optional)
      "webhook_url": "string",              // Webhook URL (for webhook method)
      "subject_template": "string",         // Email subject with placeholders
      "notification_enabled": boolean       // Send notification to recipients
    }
  }
}
```

### Placeholder Variables:

Use curly braces in `confirmation_message` and `subject_template`:

- `{first_name}` - User's first name
- `{last_name}` - User's last name
- `{email}` - User's email
- `{phone}` - User's phone number
- `{program_name}` - Program/form title
- `{form_id}` - Form identifier
- Any custom field: `{field_id}` (e.g., `{experience}`, `{age_confirm}`)

### Example:

```json
{
  "post_submission": {
    "confirmation_message": "Thank you, {first_name}! We've received your application for the {program_name} program.",
    "next_steps": [
      "Our team will review your application within 2-3 business days",
      "You'll receive an email at {email} with next steps",
      "Feel free to explore our other programs while you wait"
    ],
    "actions": [
      {
        "id": "end_session",
        "label": "I'm all set, thanks!",
        "action": "end_conversation"
      },
      {
        "id": "continue",
        "label": "I have another question",
        "action": "continue_conversation"
      }
    ],
    "fulfillment": {
      "method": "email",
      "recipients": ["applications@example.org"],
      "cc": ["volunteer-coordinator@example.org"],
      "subject_template": "New {program_name} Application: {first_name} {last_name}",
      "notification_enabled": true
    }
  }
}
```

### Action Behavior:

1. **`end_conversation`**:
   - Shows goodbye message
   - Closes chat widget
   - Clears session (optional based on `widget_behavior.persist_conversations`)

2. **`continue_conversation`**:
   - Records form completion in session context
   - Returns to normal chat mode
   - Prevents duplicate form CTAs from appearing

---

## 13. Validation Rules

### Required Fields by Section:

| Section | Required Fields |
|---------|----------------|
| Core Identity | `tenant_id`, `tenant_hash`, `subscription_tier`, `chat_title`, `tone_prompt`, `welcome_message`, `version`, `generated_at` |
| Branding | `primary_color`, `font_family` (others optional) |
| Features | All feature flags must be boolean |
| AWS | `knowledge_base_id`, `aws_region` |
| Forms | `form_id`, `program`, `title`, `fields[]` (v1.3+) |
| Form Fields | `id`, `type`, `label`, `prompt`, `required` |
| CTAs | `label`, `action`, `style` (plus action-specific fields) |

### Data Type Constraints:

- **Colors**: Must be valid hex codes: `/^#[0-9A-Fa-f]{6}$/`
- **URLs**: Must be valid HTTP/HTTPS URLs
- **Email**: Must be valid email format
- **Phone**: Must contain 10+ digits
- **Booleans**: Must be `true` or `false` (not strings)
- **Numbers**: Must be numeric (not strings)

### Logical Constraints:

**General**:
- If `features.conversational_forms` is `true`, must have at least one form in `conversational_forms`
- If `features.smart_cards` is `true`, must have `conversation_branches` and `cta_definitions`
- All CTA IDs referenced in `conversation_branches` must exist in `cta_definitions`
- Form field IDs must be unique within a form
- Form IDs must be unique across all forms

**CTA Action-Specific Requirements (v1.3+)**:
- If CTA `action` is `start_form`, must have `formId` field that references an existing form
- If CTA `action` is `external_link`, must have `url` field with valid HTTP/HTTPS URL
- If CTA `action` is `send_query`, must have `query` field with text to send to Bedrock
- If CTA `action` is `show_info`, must have `prompt` field with text to send to Bedrock

**Form Requirements (v1.3+)**:
- All forms must have `program` field that references a valid program ID
- All `formId` references in CTAs must exist in `conversational_forms`
- Forms with the same `program` value will share completion filtering behavior

---

## 14. Examples

### Minimal Valid Configuration:

```json
{
  "tenant_id": "TEST001",
  "tenant_hash": "test123abc",
  "subscription_tier": "Standard",
  "chat_title": "Test Organization",
  "tone_prompt": "You are a helpful assistant for Test Organization.",
  "welcome_message": "Welcome! How can I help?",
  "version": "1.0",
  "generated_at": 1234567890,
  "branding": {
    "primary_color": "#0066cc",
    "font_family": "system-ui"
  },
  "features": {
    "uploads": false,
    "photo_uploads": false,
    "voice_input": false,
    "streaming": true,
    "conversational_forms": false,
    "smart_cards": false,
    "callout": {
      "enabled": true,
      "auto_dismiss": false
    }
  },
  "aws": {
    "knowledge_base_id": "ABCD123456",
    "aws_region": "us-east-1"
  }
}
```

### Full-Featured Configuration:

See `Sandbox/MYR384719-config.json` for a complete example with:
- Multiple conversational forms
- Conversation branches and CTAs
- Card inventory with strategy
- Full branding configuration
- Post-submission workflows

---

## Migration Guide

### From v1.0 to v1.1:
- Added `card_inventory` section
- Added `conversation_branches` section
- Added `cta_definitions` section

### From v1.1 to v1.2:
- Added `post_submission` to conversational forms
- Added `fulfillment` configuration
- Added placeholder support in messages
- Added `widget_behavior.persist_conversations`
- Added `widget_behavior.session_timeout_minutes`

### From v1.2 to v1.3:
- **BREAKING**: Added required `program` field to all forms in `conversational_forms`
- **BREAKING**: Added required `prompt` field to CTAs with `action: "show_info"`
- Updated CTA validation rules to enforce action-specific required fields
- Clarified difference between `send_query` and `show_info` action types
- Added program-based completion filtering documentation

**Migration Steps**:
1. Add `program` field to all existing forms (must reference valid program ID)
2. Add `prompt` field to all CTAs with `action: "show_info"`
3. Validate that all program references are valid
4. Test completion filtering behavior with updated configs

**Example Migration**:
```json
// v1.2 form (missing program)
{
  "form_id": "lb_apply",
  "title": "Love Box Application",
  "fields": [...]
}

// v1.3 form (with program)
{
  "form_id": "lb_apply",
  "program": "lovebox",  // NEW REQUIRED FIELD
  "title": "Love Box Application",
  "fields": [...]
}

// v1.2 CTA (show_info without prompt)
{
  "action": "show_info",
  "label": "Learn More"
}

// v1.3 CTA (with prompt)
{
  "action": "show_info",
  "label": "Learn More",
  "prompt": "Tell me about your volunteer programs"  // NEW REQUIRED FIELD
}
```

---

## Validation Tool

A JSON Schema validator is available at:
```
/Picasso/scripts/validate-tenant-config.js
```

Usage:
```bash
node scripts/validate-tenant-config.js path/to/config.json
```

This will check:
- Required fields presence
- Data type correctness
- Reference integrity (form IDs, CTA IDs)
- Logical constraints

---

## Support

For questions or issues with tenant configuration:
1. Check this schema documentation
2. Validate your config with the validation tool
3. Review example configs in `Sandbox/`
4. Contact the platform team

---

**Document Version**: 1.3
**Schema Version**: 1.3
**Last Updated**: 2025-10-15