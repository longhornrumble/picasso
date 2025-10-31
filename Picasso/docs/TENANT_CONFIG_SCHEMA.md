# Tenant Configuration Schema

**Version**: 1.5
**Last Updated**: 2025-10-31
**Purpose**: Defines the complete configuration structure for multi-tenant Picasso deployments

**📖 Migration Guide**: See [MIGRATION_GUIDE_V1.3_TO_V1.4.1.md](./MIGRATION_GUIDE_V1.3_TO_V1.4.1.md) for upgrading existing tenants from v1.3 to v1.4.1.

**Changelog**:
- **v1.5** (2025-10-31): **Context-Based CTA Styling**
  - Removed `style` field from CTA definitions
  - Implemented position-based styling (primary/secondary based on branch placement)
  - Backend automatically assigns `_position` metadata to CTAs
  - Frontend uses `_position` instead of `style` for rendering
  - No migration required - existing configs work without `style` field
- **v1.4.1** (2025-10-30): **Action Chips Explicit Routing**
  - Changed action chips from array to dictionary format with auto-generated IDs
  - Added `target_branch` field to action chips for explicit routing
  - Added `cta_settings.fallback_branch` for fallback navigation hub
  - Deprecated `detection_keywords` (ignored by routing logic, kept for backward compatibility)
  - Implemented 3-tier routing hierarchy (action chip → CTA → fallback)
- **v1.4** (2025-10-29): Added composite field types (`name`, `address`) for grouped form inputs
- **v1.3** (2025-10-15): Added post-submission configuration and enhanced form features
- **v1.2**: Added conversational forms and smart response cards

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

1. [Routing Architecture (v1.4)](#routing-architecture-v14)
2. [Core Tenant Identity](#2-core-tenant-identity)
3. [Branding](#3-branding)
4. [Features](#4-features)
5. [Quick Help](#5-quick-help)
6. [Action Chips](#6-action-chips)
7. [Widget Behavior](#7-widget-behavior)
8. [AWS Configuration](#8-aws-configuration)
9. [Card Inventory & Strategy](#9-card-inventory--strategy)
10. [Conversation Branches](#10-conversation-branches)
11. [CTA Definitions](#11-cta-definitions)
12. [Conversational Forms](#12-conversational-forms)
13. [Post-Submission Configuration](#13-post-submission-configuration)
14. [Validation Rules](#14-validation-rules)
15. [Examples](#15-examples)

---

## 1. Routing Architecture (v1.4)

### Overview

Picasso uses a **3-tier explicit routing hierarchy** to determine which CTAs to display based on user interactions. This system provides deterministic routing instead of relying on keyword detection.

### The 3-Tier Routing Hierarchy

**Tier 1: Action Chip Routing** *(Highest Priority)*
- **Trigger**: When user clicks an action chip with `target_branch` set
- **Behavior**: Routes directly to specified conversation branch
- **Example**: Click "Volunteer" chip → route to `volunteer_interest` branch → show volunteer-related CTAs
- **Configuration**: `action_chips.default_chips[chip_id].target_branch`

**Tier 2: CTA Routing** *(Medium Priority)*
- **Trigger**: When user clicks a CTA button with `target_branch` set
- **Behavior**: Routes directly to specified conversation branch
- **Example**: Click "Apply" CTA → route to `application_flow` branch → show application-related CTAs
- **Configuration**: `cta_definitions[cta_id].target_branch`

**Tier 3: Fallback Navigation Hub** *(Lowest Priority)*
- **Trigger**: When user types free-form query (no explicit routing match)
- **Behavior**: Routes to `cta_settings.fallback_branch`
- **Example**: User types "What can I do?" → route to `navigation_hub` branch → show primary navigation CTAs
- **Configuration**: `cta_settings.fallback_branch`

### Routing Flow Diagram

```
User Interaction
      ↓
[Action Chip Click?] → YES → Has target_branch? → YES → Route to target_branch → Show branch CTAs
      ↓ NO                                          ↓ NO
[CTA Button Click?] → YES → Has target_branch? → YES → Route to target_branch → Show branch CTAs
      ↓ NO                                          ↓ NO
[Free-form Query] → Route to fallback_branch → Show fallback CTAs
      ↓
[No fallback_branch configured] → No CTAs shown (graceful degradation)
```

### Backward Compatibility

**v1.3 Configs** (Array-based action chips, keyword detection):
- System detects array format and falls back to legacy keyword-based routing
- `detection_keywords` field used for CTA selection
- No impact on existing deployments

**v1.4 Configs without `fallback_branch`**:
- Explicit routing works for action chips and CTAs with `target_branch`
- Free-form queries show no CTAs (graceful degradation)
- No errors or breaking changes

### Configuration Requirements for v1.4 Explicit Routing

**Required**:
1. ✅ Action chips must be in **dictionary format** (not array)
2. ✅ Action chips should have `target_branch` fields pointing to valid branches
3. ✅ `cta_settings.fallback_branch` must be configured (recommended: `"navigation_hub"`)
4. ✅ All conversation branches must have `available_ctas` defined
5. ✅ All `target_branch` references must point to existing branches in `conversation_branches`

**Deprecated** (Ignored but safe to keep):
- ⚠️ `detection_keywords` in conversation branches (ignored by v1.4 routing logic)

### Migration from v1.3 to v1.4

**Automatic Transformations** (via `deploy_tenant_stack` Lambda):
- Action chips array → dictionary with auto-generated IDs
- IDs generated via slugification: `"Learn More" → "learn_more"`
- Duplicate IDs get numeric suffix: `"volunteer" → "volunteer_2"`
- `target_branch` initially set to `null` (configure in Config Builder)

**Manual Configuration** (in Config Builder UI):
1. Add `fallback_branch` to `cta_settings` (e.g., `"navigation_hub"`)
2. Create navigation hub branch with primary CTAs
3. Set `target_branch` on action chips for explicit routing
4. Test routing with sample interactions

**Example Migration**:
```json
// v1.3 - Array format with keywords
{
  "action_chips": {
    "default_chips": [
      {"label": "Volunteer", "value": "Tell me about volunteering"}
    ]
  },
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help"],  // Used in v1.3
      "available_ctas": {...}
    }
  }
}

// v1.4 - Dictionary format with explicit routing
{
  "action_chips": {
    "default_chips": {
      "volunteer": {
        "label": "Volunteer",
        "value": "Tell me about volunteering",
        "target_branch": "volunteer_interest"  // NEW: Explicit routing
      }
    }
  },
  "cta_settings": {
    "fallback_branch": "navigation_hub"  // NEW: Fallback for free-form queries
  },
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help"],  // Ignored in v1.4, kept for compatibility
      "available_ctas": {...}
    },
    "navigation_hub": {  // NEW: Fallback branch
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["donate", "learn_more"]
      }
    }
  }
}
```

### Benefits of Explicit Routing

1. **Deterministic**: No ambiguity from keyword matching
2. **Predictable**: Developers know exactly which branch will activate
3. **Maintainable**: Easy to trace routing logic in configuration
4. **Scalable**: No keyword collision issues as tenant grows
5. **Testable**: Can unit test routing with known inputs
6. **User-Friendly**: Clear navigation paths through conversation

---

## 2. Core Tenant Identity

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

## 3. Branding

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

## 4. Features

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

## 5. Quick Help

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

## 6. Action Chips

**Suggested action buttons shown below bot messages. In v1.4, action chips support explicit routing to conversation branches.**

### v1.4 Dictionary Format (Current)

```json
{
  "action_chips": {
    "enabled": boolean,                     // Enable action chips
    "max_display": number,                  // Maximum chips to show (1-5)
    "show_on_welcome": boolean,             // Show chips on initial welcome message
    "short_text_threshold": number,         // Character count for layout switch (default: 16)
    "default_chips": {                      // Dictionary of action chips keyed by chip ID
      "volunteer": {                        // Chip ID (auto-generated via slugification)
        "label": "string",                  // Display text (can include emoji)
        "value": "string",                  // Text sent as user message when clicked
        "target_branch": "string|null"      // NEW v1.4: Conversation branch to route to
      },
      "donate": {
        "label": "Donate",
        "value": "How can I donate?",
        "target_branch": "donation_interest"
      },
      "learn_more": {
        "label": "Learn More",
        "value": "Tell me more about your programs",
        "target_branch": null               // Falls back to cta_settings.fallback_branch
      }
    }
  }
}
```

### Field Details

- **`default_chips`** *(object)*: Dictionary of action chips keyed by chip ID
  - **⚠️ Format Change (v1.4)**: Changed from array to dictionary with auto-generated IDs
  - **Chip IDs**: Generated via slugification during deployment
    - Example: `"Learn More" → "learn_more"`
    - Example: `"Volunteer Opportunities" → "volunteer_opportunities"`
  - **Collision Handling**: If duplicate IDs exist, numeric suffix added automatically
    - Example: Two "Volunteer" chips → `"volunteer"` and `"volunteer_2"`

- **`target_branch`** *(string|null)*: **NEW in v1.4** - Conversation branch to route to when chip clicked
  - If `null` or missing, falls back to `cta_settings.fallback_branch`
  - Must reference existing branch in `conversation_branches`
  - Enables **Tier 1 routing** (highest priority in routing hierarchy)
  - Example: `"target_branch": "volunteer_interest"` → Routes to volunteer_interest branch and shows its CTAs

### v1.3 Array Format (Legacy, Still Supported)

```json
{
  "action_chips": {
    "enabled": true,
    "default_chips": [                      // Array format (v1.3 and earlier)
      {
        "label": "Volunteer",
        "value": "Tell me about volunteer opportunities"
      }
    ]
  }
}
```

**Backward Compatibility**: The system detects array format and falls back to keyword-based routing using `detection_keywords` in conversation branches.

### ID Generation Rules (v1.4)

When `deploy_tenant_stack` Lambda transforms array → dictionary:

1. **Slugification**: Label converted to lowercase, spaces → underscores, special chars removed
   - `"Volunteer Opportunities"` → `"volunteer_opportunities"`
   - `"Learn More 🎓"` → `"learn_more"`
   - `"Get Started!"` → `"get_started"`

2. **Collision Resolution**: Numeric suffix added if ID already exists
   - First "Volunteer" chip → `"volunteer"`
   - Second "Volunteer" chip → `"volunteer_2"`
   - Third "Volunteer" chip → `"volunteer_3"`

3. **Pattern Validation**: IDs must match `^[a-z0-9_]+$`
   - Lowercase alphanumeric plus underscores only
   - No spaces, no special characters

### Guidelines

- **`max_display`**: Recommended 3-4 for mobile, 4-5 for desktop
- **`short_text_threshold`**: Chips with text longer than this use vertical layout
- **Chip labels**: Keep under 30 characters, ideally under 20
- **Use emoji**: Helps with visual scanning and personality
- **Explicit Routing** (v1.4): Always set `target_branch` for deterministic routing
  - Route users to relevant conversation contexts
  - Improves CTA relevance and conversion
  - Eliminates keyword matching ambiguity

### Example: Complete Action Chips Configuration

```json
{
  "action_chips": {
    "enabled": true,
    "max_display": 4,
    "show_on_welcome": true,
    "short_text_threshold": 16,
    "default_chips": {
      "volunteer": {
        "label": "👥 Volunteer",
        "value": "Tell me about volunteer opportunities",
        "target_branch": "volunteer_interest"
      },
      "donate": {
        "label": "💝 Donate",
        "value": "How can I donate?",
        "target_branch": "donation_interest"
      },
      "programs": {
        "label": "📚 Programs",
        "value": "What programs do you offer?",
        "target_branch": "program_exploration"
      },
      "contact": {
        "label": "📞 Contact",
        "value": "How can I contact you?",
        "target_branch": null  // Uses fallback_branch
      }
    }
  }
}
```

### Routing Behavior Example

When user clicks the "👥 Volunteer" chip:
1. System reads `target_branch: "volunteer_interest"`
2. Routes to `conversation_branches.volunteer_interest`
3. Displays CTAs defined in that branch's `available_ctas`
4. User sees volunteer-specific actions (e.g., "Start Application", "View Requirements")

---

## 7. Widget Behavior

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

## 8. AWS Configuration

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

## 9. Card Inventory & Strategy

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

## 9a. CTA Settings

**Global configuration for call-to-action display and routing behavior.**

```json
{
  "cta_settings": {
    "fallback_branch": "string|null",       // NEW v1.4: Default branch for unmatched routing
    "max_display": number,                  // Maximum CTAs to show at once (default: 3)
    "bundling_strategy": "string"           // "readiness_based" | "context_based" | "simple"
  }
}
```

### Field Details

- **`fallback_branch`** *(string|null)*: **NEW in v1.4** - Default conversation branch for free-form queries
  - Used when user types a query that doesn't match action chips or CTA routing
  - Must reference an existing key in `conversation_branches`
  - If `null` or missing, no CTAs shown for unmatched queries (backward compatible)
  - **Recommended**: Create a `"navigation_hub"` branch with primary navigation CTAs
  - **Tier 3 routing**: Lowest priority in the 3-tier routing hierarchy

- **`max_display`** *(number)*: Maximum number of CTAs to display simultaneously
  - Recommended: 2-3 for mobile, 3-4 for desktop
  - Prevents overwhelming users with too many choices

- **`bundling_strategy`** *(string)*: How CTAs are grouped and displayed
  - **`readiness_based`**: Show CTAs based on user's conversation readiness score
  - **`context_based`**: Show CTAs based on conversation branch context
  - **`simple`**: Show all available CTAs up to max_display

### Example Configuration

```json
{
  "cta_settings": {
    "fallback_branch": "navigation_hub",
    "max_display": 3,
    "bundling_strategy": "readiness_based"
  },
  "conversation_branches": {
    "navigation_hub": {
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["donate", "learn_more", "contact_us"]
      }
    },
    "volunteer_interest": {
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["view_requirements", "schedule_discovery"]
      }
    },
    "donation_interest": {
      "available_ctas": {
        "primary": "donate_now",
        "secondary": ["donation_options", "learn_impact"]
      }
    }
  }
}
```

### Fallback Branch Behavior

The `fallback_branch` acts as a "home base" for navigation when no explicit routing applies:

**Scenario 1: User types free-form query**
```
User: "What can I do to help?"
↓
No matching action chip or CTA routing
↓
Route to fallback_branch ("navigation_hub")
↓
Show primary navigation CTAs (volunteer, donate, learn more)
```

**Scenario 2: User returns from completed form**
```
User completes form → Returns to chat
↓
Route to fallback_branch
↓
Show CTAs from navigation_hub (excluding completed form)
```

**Scenario 3: Ambiguous user intent**
```
User: "Tell me more"
↓
Too vague for specific branch routing
↓
Route to fallback_branch
↓
Show general navigation options
```

### Migration Notes

**For v1.3 configs without `fallback_branch`**:
- Explicit routing (action chips, CTAs with `target_branch`) works normally
- Free-form queries show no CTAs (graceful degradation)
- No errors or breaking changes

**To enable v1.4 fallback routing**:
1. Add `cta_settings.fallback_branch` to config
2. Create corresponding branch in `conversation_branches`
3. Define `available_ctas` for fallback branch
4. Test with free-form queries

**Recommended Fallback Branch CTAs**:
- Primary action (e.g., "Get Started", "Apply Now")
- Secondary actions (e.g., "Learn More", "Contact Us", "View Programs")
- Keep CTAs broad and universally applicable

---

## 10. Conversation Branches

**Maps conversation topics to available CTAs for contextual card selection. In v1.4, branches are activated via explicit routing instead of keyword detection.**

```json
{
  "conversation_branches": {
    "branch_name": {
      "detection_keywords": ["string"],     // DEPRECATED in v1.4 - kept for backward compatibility
      "available_ctas": {
        "primary": "string",                // CTA ID (references cta_definitions)
        "secondary": ["string"]             // Array of CTA IDs
      }
    }
  }
}
```

### ⚠️ v1.4 Routing Change

The `detection_keywords` field is **deprecated in v1.4** and **ignored by the routing logic**. Conversation branches are now activated through:

1. **Action chip `target_branch`** (Tier 1 routing)
2. **CTA `target_branch`** (Tier 2 routing)
3. **`cta_settings.fallback_branch`** (Tier 3 routing)

**Why the change?**
- Keyword matching was ambiguous and unpredictable
- Explicit routing provides deterministic behavior
- Easier to maintain and debug routing logic
- Better user experience with clear navigation paths

**Migration Impact**:
- ✅ `detection_keywords` can remain in config (won't cause errors)
- ✅ No breaking changes - system gracefully ignores deprecated field
- ❌ Keywords no longer affect CTA selection in v1.4 configs
- ⚠️ To re-enable routing for a branch, add `target_branch` to action chips or CTAs

### Example: v1.4 Configuration

```json
{
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help", "involved", "participate", "join"],  // DEPRECATED - ignored in v1.4
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["view_programs", "schedule_discovery"]
      }
    },
    "program_exploration": {
      "detection_keywords": ["programs", "opportunities", "what do you offer"],  // DEPRECATED - ignored in v1.4
      "available_ctas": {
        "primary": "schedule_discovery",
        "secondary": ["lovebox_info", "daretodream_info"]
      }
    },
    "navigation_hub": {
      "available_ctas": {
        "primary": "get_started",
        "secondary": ["volunteer_apply", "donate", "contact_us"]
      }
    }
  },
  "action_chips": {
    "default_chips": {
      "volunteer": {
        "label": "Volunteer",
        "value": "Tell me about volunteering",
        "target_branch": "volunteer_interest"  // NEW: Explicit routing to branch
      },
      "programs": {
        "label": "Programs",
        "value": "What programs do you offer?",
        "target_branch": "program_exploration"  // NEW: Explicit routing to branch
      }
    }
  },
  "cta_settings": {
    "fallback_branch": "navigation_hub"  // NEW: Default branch for unmatched queries
  }
}
```

### Field Details

- **`detection_keywords`** *(array)*: **DEPRECATED** - Array of keywords for branch detection
  - **Status**: Ignored by v1.4 routing logic
  - **Compatibility**: Safe to keep in config, won't cause errors
  - **Recommendation**: Can be removed or left for documentation purposes

- **`available_ctas`** *(object)*: CTAs to display when this branch is active
  - **Required**: Must be defined for all branches
  - **`primary`**: Single CTA ID (most important action)
  - **`secondary`**: Array of CTA IDs (alternative actions)

### Guidelines

- **All branches must have `available_ctas` defined** - this is required regardless of routing version
- **Branch names** should be descriptive (e.g., `volunteer_interest`, `donation_interest`, `navigation_hub`)
- **Primary CTA** should be the most relevant action for the conversation context
- **Secondary CTAs** provide alternative paths (recommended: 2-3 max)
- **Navigation hub branch** recommended as fallback (broad, universally applicable CTAs)

---

## 11. CTA Definitions

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
      "_position": "string"                 // INTERNAL USE ONLY: "primary" | "secondary" (assigned by backend)
    }
  }
}
```

> **⚠️ IMPORTANT - Position-Based Styling (v1.5)**:
> - The `style` field has been **removed** as of v1.5.
> - CTAs now use **position-based styling** determined by their placement in conversation branches.
> - **Primary CTAs** (first in `available_ctas.primary`) automatically receive primary styling.
> - **Secondary CTAs** (in `available_ctas.secondary` array) automatically receive secondary styling.
> - The `_position` field is **added automatically by the backend** - do not include it in your config files.
> - This change makes CTA styling consistent and predictable based on conversation flow.

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

### Styling (Position-Based):

> **Changed in v1.5**: Styling is now determined by CTA **position in conversation branches**, not by a `style` field.

- **Primary Position** (solid color, brand styling):
  - Assigned to CTAs in `available_ctas.primary`
  - Used for primary actions (e.g., form submissions, key workflows)

- **Secondary Position** (outline style, subtle):
  - Assigned to CTAs in `available_ctas.secondary` array
  - Used for alternative actions (e.g., navigation, information requests)

### Example:

```json
{
  "cta_definitions": {
    "volunteer_apply": {
      "text": "Start Volunteer Application",
      "label": "Start Application",
      "action": "start_form",
      "formId": "volunteer_general",
      "type": "form_trigger"
    },
    "schedule_discovery": {
      "text": "Schedule Discovery Session",
      "label": "Schedule Discovery Session",
      "action": "external_link",
      "url": "https://example.org/schedule",
      "type": "external_link"
    },
    "lovebox_info": {
      "text": "Learn About Love Box",
      "label": "Learn About Love Box",
      "action": "show_info",
      "prompt": "Tell me about the Love Box program, including eligibility requirements and how to apply",
      "type": "info_request"
    },
    "view_requirements": {
      "text": "View Requirements",
      "label": "View Requirements",
      "action": "show_info",
      "prompt": "What are the volunteer requirements for this organization?",
      "type": "info_request"
    }
  }
}
```

> **Note**: Styling is determined by CTA placement in conversation branches. If `volunteer_apply` is placed in `available_ctas.primary`, it will be styled as primary. If `lovebox_info` is in `available_ctas.secondary`, it will be styled as secondary.

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

## 12. Conversational Forms

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
| `name` | **Composite**: Full name | First/Middle/Last subfields | Grouped inputs on one screen |
| `address` | **Composite**: US address | Street/City/State/ZIP subfields | Grouped inputs on one screen |

### Composite Field Types (NEW in v1.4):

Composite field types group multiple related inputs into a single form step for better UX. Instead of asking for first name, middle name, and last name separately across 3 screens, the `name` field type shows all name inputs together.

#### Name Field (`type: "name"`):

Automatically creates three subfields:
- **First Name** (required)
- **Middle Name** (optional)
- **Last Name** (required)

Example configuration:
```json
{
  "id": "full_name",
  "type": "name",
  "label": "Full Name",
  "prompt": "What's your full name?",
  "required": true
}
```

User sees all three fields together:
```
Full Name *
┌─────────────────────────┐
│ First Name *            │
│ [John              ]    │
│                         │
│ Middle Name             │
│ [A.                ]    │
│                         │
│ Last Name *             │
│ [Smith             ]    │
└─────────────────────────┘
[Submit]
```

Data storage format:
```json
{
  "full_name": {
    "_display": "John A. Smith",
    "full_name.first_name": "John",
    "full_name.middle_name": "A.",
    "full_name.last_name": "Smith"
  }
}
```

#### Address Field (`type: "address"`):

Automatically creates five subfields:
- **Street Address** (required)
- **Apt/Suite/Unit** (optional)
- **City** (required)
- **State** (required) - 2-letter abbreviation
- **ZIP Code** (required) - Validates format: 12345 or 12345-6789

Example configuration:
```json
{
  "id": "mailing_address",
  "type": "address",
  "label": "Address",
  "prompt": "What's your mailing address?",
  "required": true
}
```

User sees all five fields together:
```
Mailing Address *
┌─────────────────────────┐
│ Street Address *        │
│ [123 Main Street   ]    │
│                         │
│ Apt/Suite/Unit          │
│ [Apt 4B            ]    │
│                         │
│ City *                  │
│ [Portland          ]    │
│                         │
│ State *                 │
│ [OR                ]    │
│                         │
│ ZIP Code *              │
│ [97201             ]    │
└─────────────────────────┘
[Submit]
```

Data storage format:
```json
{
  "mailing_address": {
    "_display": "123 Main Street, Apt 4B, Portland, OR 97201",
    "mailing_address.street": "123 Main Street",
    "mailing_address.apt_unit": "Apt 4B",
    "mailing_address.city": "Portland",
    "mailing_address.state": "OR",
    "mailing_address.zip_code": "97201"
  }
}
```

**Important Notes**:
- Composite fields count as a **single step** in form progress (e.g., "Step 2 of 5")
- The `_display` property is automatically generated for confirmation messages and summaries
- Individual subfield values are accessible via dotted notation (e.g., `{full_name.first_name}`)
- The `_display` value can be used in placeholders (e.g., `{full_name}` → "John A. Smith")
- Subfields cannot be customized - they use predefined templates for consistency
- Validation is applied to individual subfields (e.g., ZIP code format)

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

## 13. Post-Submission Configuration

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

## 14. Validation Rules

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

### Routing Validation (v1.4)

**Action Chips**:
- `target_branch` must reference existing key in `conversation_branches` (if not null)
- Chip IDs must match pattern: `^[a-z0-9_]+$` (lowercase alphanumeric plus underscores)
- Chip IDs must be unique within tenant config
- Action chips must be in dictionary format (object, not array) for v1.4 routing

**CTA Settings**:
- `fallback_branch` must reference existing key in `conversation_branches` (if not null)
- Referenced fallback branch must have `available_ctas` configured
- If `fallback_branch` is null/missing, system gracefully degrades (no CTAs for unmatched queries)

**Conversation Branches**:
- All branches referenced by `target_branch` fields must exist in `conversation_branches`
- All branches must have `available_ctas` defined
- `detection_keywords` field is **ignored in v1.4** (optional, can be omitted or kept for backward compatibility)

**Validation Examples**:

✅ **Valid Configuration**:
```json
{
  "action_chips": {
    "default_chips": {
      "volunteer": {
        "label": "Volunteer",
        "value": "Tell me about volunteering",
        "target_branch": "volunteer_interest"  // ✅ References existing branch
      }
    }
  },
  "cta_settings": {
    "fallback_branch": "navigation_hub"  // ✅ References existing branch
  },
  "conversation_branches": {
    "volunteer_interest": {
      "available_ctas": {
        "primary": "volunteer_apply"  // ✅ Has CTAs defined
      }
    },
    "navigation_hub": {
      "available_ctas": {
        "primary": "get_started"  // ✅ Has CTAs defined
      }
    }
  }
}
```

❌ **Invalid Configurations**:
```json
// Error: target_branch references non-existent branch
{
  "action_chips": {
    "default_chips": {
      "volunteer": {
        "target_branch": "nonexistent_branch"  // ❌ Branch doesn't exist
      }
    }
  }
}

// Error: fallback_branch references branch without CTAs
{
  "cta_settings": {
    "fallback_branch": "empty_branch"  // ❌ Branch has no available_ctas
  },
  "conversation_branches": {
    "empty_branch": {}  // ❌ Missing available_ctas
  }
}

// Error: Invalid chip ID format
{
  "action_chips": {
    "default_chips": {
      "Volunteer-Option!": {  // ❌ Invalid ID (uppercase, special chars)
        "label": "Volunteer"
      }
    }
  }
}
```

⚠️ **Valid but Degraded**:
```json
// No errors, but unmatched queries show no CTAs
{
  "cta_settings": {
    "fallback_branch": null  // ⚠️ No fallback - graceful degradation
  },
  "action_chips": {
    "default_chips": {
      "volunteer": {
        "target_branch": "volunteer_interest"  // ✅ Explicit routing works
      }
    }
  }
}
```

---

## 15. Examples

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

### From v1.3 to v1.4:
- Added composite field types (`name`, `address`) for grouped form inputs
- All existing configs remain fully compatible

### From v1.4 to v1.4.1:
- **NON-BREAKING**: Changed action chips from array to dictionary format
- **NEW**: Added `target_branch` field to action chips for explicit routing
- **NEW**: Added `cta_settings.fallback_branch` for fallback navigation hub
- **DEPRECATED**: `detection_keywords` in conversation branches (ignored by routing logic)
- Implemented 3-tier routing hierarchy (action chip → CTA → fallback)

**Migration Steps**:

**Automatic (via `deploy_tenant_stack` Lambda)**:
1. Action chips array automatically converted to dictionary format
2. IDs auto-generated via slugification (e.g., `"Volunteer" → "volunteer"`)
3. `target_branch` initially set to `null` (configure manually for explicit routing)
4. Existing v1.3 configs work without changes (backward compatible)

**Manual Configuration (in Config Builder UI)**:
1. Add `cta_settings.fallback_branch` to config (recommended: `"navigation_hub"`)
2. Create navigation hub branch with primary CTAs:
   ```json
   "navigation_hub": {
     "available_ctas": {
       "primary": "get_started",
       "secondary": ["volunteer_apply", "donate", "learn_more"]
     }
   }
   ```
3. Set `target_branch` on action chips for explicit routing:
   ```json
   "volunteer": {
     "label": "Volunteer",
     "value": "Tell me about volunteering",
     "target_branch": "volunteer_interest"
   }
   ```
4. Test routing with sample interactions:
   - Click action chips to verify Tier 1 routing
   - Click CTAs to verify Tier 2 routing
   - Type free-form queries to verify Tier 3 fallback routing

**Example Migration**:
```json
// v1.3/v1.4 - Array format with keyword detection
{
  "action_chips": {
    "default_chips": [
      {"label": "Volunteer", "value": "Tell me about volunteering"}
    ]
  },
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help"],  // Used in v1.3
      "available_ctas": {
        "primary": "volunteer_apply"
      }
    }
  }
}

// v1.4.1 - Dictionary format with explicit routing
{
  "action_chips": {
    "default_chips": {
      "volunteer": {  // Auto-generated ID
        "label": "Volunteer",
        "value": "Tell me about volunteering",
        "target_branch": "volunteer_interest"  // NEW: Explicit routing
      }
    }
  },
  "cta_settings": {
    "fallback_branch": "navigation_hub"  // NEW: Fallback for free-form queries
  },
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help"],  // Ignored in v1.4.1, kept for compatibility
      "available_ctas": {
        "primary": "volunteer_apply"
      }
    },
    "navigation_hub": {  // NEW: Fallback branch
      "available_ctas": {
        "primary": "get_started",
        "secondary": ["volunteer_apply", "donate", "learn_more"]
      }
    }
  }
}
```

**Benefits of v1.4.1 Routing**:
- ✅ **Deterministic**: No keyword matching ambiguity
- ✅ **Predictable**: Clear navigation paths
- ✅ **Maintainable**: Easy to trace routing logic
- ✅ **Scalable**: No keyword collision issues
- ✅ **Backward Compatible**: v1.3 configs work without changes

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

**Document Version**: 1.4.1
**Schema Version**: 1.4.1
**Last Updated**: 2025-10-30