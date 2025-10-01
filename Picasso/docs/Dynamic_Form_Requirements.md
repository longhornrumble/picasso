# Dynamic Form Requirements

## Overview

This document outlines strategies for defining reusable form field requirements (like age gates and commitment confirmations) that can be shared across multiple conversational forms without duplication.

## Problem Statement

Currently, eligibility requirements are duplicated across multiple forms:
- Age confirmation (22+ years old)
- Commitment confirmation (1 year minimum)
- Background check requirements
- Other universal prerequisites

When these requirements need to change, they must be updated in multiple places, increasing maintenance burden and risk of inconsistency.

## Solutions

### Option 1: JSON References (Manual Resolution)

Define requirements once and reference them using JSON pointer syntax.

#### Config Structure

```json
{
  "eligibility_requirements": {
    "age_22_plus": {
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
      "failure_message": "This program requires volunteers to be at least 22 years old. We appreciate your interest!"
    },
    "commitment_one_year": {
      "id": "commitment_confirm",
      "type": "select",
      "label": "Commitment",
      "prompt": "Can you commit to at least one full year of volunteering?",
      "required": true,
      "options": [
        { "value": "yes", "label": "Yes, I can commit to one year" },
        { "value": "no", "label": "No, I cannot commit to a full year" }
      ],
      "eligibility_gate": true,
      "failure_message": "This program requires a one-year commitment to build meaningful relationships. We appreciate your interest!"
    }
  },
  "conversational_forms": {
    "lovebox_application": {
      "enabled": true,
      "form_id": "lb_apply",
      "title": "Love Box Application",
      "fields": [
        { "id": "first_name", "type": "text", "label": "First Name", "prompt": "What's your first name?", "required": true },
        { "$ref": "eligibility_requirements.age_22_plus" },
        { "$ref": "eligibility_requirements.commitment_one_year" }
      ]
    },
    "daretodream_application": {
      "enabled": true,
      "form_id": "dd_apply",
      "title": "Dare to Dream Mentor Application",
      "fields": [
        { "id": "first_name", "type": "text", "label": "First Name", "prompt": "What's your first name?", "required": true },
        { "$ref": "eligibility_requirements.age_22_plus" },
        { "$ref": "eligibility_requirements.commitment_one_year" }
      ]
    }
  }
}
```

#### Implementation

Add a config preprocessor in `useConfig` hook:

```javascript
// src/hooks/useConfig.js

function resolveReferences(config) {
  if (!config.eligibility_requirements) return config;

  const requirements = config.eligibility_requirements;

  if (config.conversational_forms) {
    Object.values(config.conversational_forms).forEach(form => {
      form.fields = form.fields.map(field => {
        if (field.$ref && field.$ref.startsWith('eligibility_requirements.')) {
          const requirementKey = field.$ref.replace('eligibility_requirements.', '');
          const requirement = requirements[requirementKey];

          if (!requirement) {
            console.error(`[useConfig] Requirement reference not found: ${field.$ref}`);
            return field;
          }

          return { ...requirement };
        }
        return field;
      });
    });
  }

  return config;
}

// In useConfig hook
useEffect(() => {
  const loadConfig = async () => {
    const rawConfig = await fetchConfig();
    const resolvedConfig = resolveReferences(rawConfig);
    setConfig(resolvedConfig);
  };

  loadConfig();
}, []);
```

**Pros:**
- Standard JSON reference syntax
- Clear separation of requirements from forms
- Single source of truth

**Cons:**
- Requires custom resolution logic
- No per-form customization without additional syntax

---

### Option 2: Template Expansion with Overrides

Define field templates and allow forms to override specific properties.

#### Config Structure

```json
{
  "field_templates": {
    "age_gate": {
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
      "failure_message": "This program requires volunteers to be at least 22 years old."
    },
    "commitment_gate": {
      "id": "commitment_confirm",
      "type": "select",
      "label": "Commitment",
      "prompt": "Can you commit to at least one full year?",
      "required": true,
      "options": [
        { "value": "yes", "label": "Yes, I can commit to one year" },
        { "value": "no", "label": "No, I cannot commit to a full year" }
      ],
      "eligibility_gate": true,
      "failure_message": "This program requires a one-year commitment to build meaningful relationships."
    }
  },
  "conversational_forms": {
    "lovebox_application": {
      "enabled": true,
      "form_id": "lb_apply",
      "title": "Love Box Application",
      "fields": [
        { "id": "first_name", "type": "text", "label": "First Name", "prompt": "What's your first name?", "required": true },
        {
          "template": "age_gate",
          "override": {
            "failure_message": "Love Box requires volunteers to be at least 22 years old. We appreciate your interest!"
          }
        },
        {
          "template": "commitment_gate",
          "override": {
            "prompt": "Can you commit to at least one full year of volunteering with a Love Box family?",
            "failure_message": "Love Box requires a one-year commitment to build meaningful relationships with foster families."
          }
        }
      ]
    }
  }
}
```

#### Implementation

Add a template expansion function in `useConfig` hook:

```javascript
// src/hooks/useConfig.js

function expandFieldTemplates(config) {
  const templates = config.field_templates || {};

  if (config.conversational_forms) {
    Object.values(config.conversational_forms).forEach(form => {
      form.fields = form.fields.map(field => {
        if (field.template) {
          const template = templates[field.template];

          if (!template) {
            console.error(`[useConfig] Template not found: ${field.template}`);
            return field;
          }

          // Merge template with overrides
          const expandedField = { ...template, ...(field.override || {}) };

          // Remove template metadata
          delete expandedField.template;
          delete expandedField.override;

          return expandedField;
        }
        return field;
      });
    });
  }

  return config;
}

// In useConfig hook
useEffect(() => {
  const loadConfig = async () => {
    const rawConfig = await fetchConfig();
    const expandedConfig = expandFieldTemplates(rawConfig);
    setConfig(expandedConfig);
  };

  loadConfig();
}, []);
```

**Pros:**
- Supports per-form customization
- Simple merge logic
- Flexible override system

**Cons:**
- Custom syntax (not a standard)
- Slightly more verbose than Option 1

---

### Option 3: Direct Duplication (Current Approach)

Keep field definitions duplicated across forms.

#### Config Structure

```json
{
  "conversational_forms": {
    "lovebox_application": {
      "fields": [
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
          "failure_message": "Love Box requires volunteers to be at least 22 years old."
        },
        {
          "id": "commitment_confirm",
          "type": "select",
          "label": "Commitment",
          "prompt": "Can you commit to at least one full year of volunteering?",
          "required": true,
          "options": [
            { "value": "yes", "label": "Yes, I can commit to one year" },
            { "value": "no", "label": "No, I cannot commit to a full year" }
          ],
          "eligibility_gate": true,
          "failure_message": "Love Box requires a one-year commitment."
        }
      ]
    },
    "daretodream_application": {
      "fields": [
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
          "failure_message": "Dare to Dream requires mentors to be at least 22 years old."
        }
      ]
    }
  }
}
```

**Pros:**
- No code changes required
- Works today
- Maximum flexibility per form
- Easy to understand and debug

**Cons:**
- Verbose and repetitive
- Harder to maintain consistency
- Updates require changing multiple places

---

## Recommendation

### Phase 1: Use Option 3 (Current Approach)
- **When**: Starting out, fewer than 5 forms, infrequent requirement changes
- **Why**: No code changes, works immediately, simple to understand

### Phase 2: Implement Option 2 (Template Expansion)
- **When**: Managing 5+ forms, requirements change frequently, need customization
- **Why**: Best balance of DRY principle and flexibility
- **Implementation**: Add simple preprocessor to `useConfig` hook

### Phase 3 (Future): Consider Option 1 (JSON References)
- **When**: Need stricter standardization, enterprise-scale with 20+ forms
- **Why**: Industry-standard JSON pointer syntax, tooling support
- **Implementation**: Requires more robust resolution logic

## Implementation Location

**Frontend Only (Recommended)**:
- Resolve references/templates in `useConfig` hook when config loads
- One-time processing, cached result
- Lambda receives already-resolved fields
- No duplication of logic across frontend/backend

**Why Not Lambda?**:
- Would require implementing same logic in Python
- Duplication of resolution logic
- Harder to maintain consistency
- Frontend already parses config for rendering

## Migration Path

If moving from Option 3 → Option 2:

1. Create `field_templates` section in config
2. Add `expandFieldTemplates()` function to `useConfig` hook
3. Update one form at a time to use templates
4. Test each form migration independently
5. Remove duplicated field definitions once all forms migrated

## Testing Considerations

When implementing dynamic requirements:

1. **Unit Test Template Resolution**
   ```javascript
   describe('expandFieldTemplates', () => {
     it('should expand template references', () => {
       const config = {
         field_templates: { age_gate: { id: 'age', type: 'select' } },
         conversational_forms: {
           test_form: { fields: [{ template: 'age_gate' }] }
         }
       };

       const result = expandFieldTemplates(config);
       expect(result.conversational_forms.test_form.fields[0].id).toBe('age');
     });
   });
   ```

2. **Integration Test Form Rendering**
   - Ensure forms render correctly with resolved fields
   - Verify eligibility gates still function
   - Test override behavior

3. **E2E Test Form Submission**
   - Test complete form flow with templated fields
   - Verify validation and submission work correctly

## Performance Considerations

- Template resolution happens once when config loads
- Negligible performance impact (<1ms for typical configs)
- Resolved config is cached in memory
- No impact on form runtime performance

## Related Documentation

- [Conversational Forms Implementation](./Conversational_Forms_Implementation_Plan_v4.md)
- [Form Configuration Schema](../src/config/schemas/form-config-schema.json)
- [Phase 1B: HTTP Fallback Parity](./PRD_Phase1B_HTTP_Fallback_Parity.md)
