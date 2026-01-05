# Forms Configuration Admin - Implementation Guide

**Document Version:** 1.0
**Last Updated:** October 14, 2025
**Purpose:** Step-by-step implementation guide for building the Forms Configuration Admin interface in Bubble

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Data Structure Setup](#data-structure-setup)
4. [Section 1: Form Collection](#section-1-form-collection)
5. [Section 2: Programs & Interests](#section-2-programs--interests)
6. [Section 3: Notification Rules](#section-3-notification-rules)
7. [Section 4: Integration Settings](#section-4-integration-settings)
8. [S3 Config Sync](#s3-config-sync)
9. [Testing Checklist](#testing-checklist)

---

## Overview

This guide implements 4 new configuration sections for conversational forms:

- **Form Collection:** Configure forms, fields, and behavior settings
- **Programs & Interests:** Manage programs for routing submissions
- **Notification Rules:** Configure email notifications per program
- **Integration Settings:** Manage N8N webhooks and routing rules

**Reference Mockup:** `/Users/chrismiller/Desktop/Working_Folder/Sandbox/forms-config-sections-only.html`

---

## Prerequisites

**Existing Bubble Data Types Required:**
- `Tenant` (already exists)
- `Form_Notification_Rule` (already exists)
- `Integration_Config` (already exists)
- `Integration_Rule` (already exists)

**Plugins Required:**
- Bubble S3 File Uploader (for config sync)
- API Connector (for S3 operations)

**Permissions Required:**
- Admin access to Bubble app
- AWS S3 write access to `myrecruiter-picasso` bucket

---

## Data Structure Setup

### Step 1: Create New Data Types

#### **Data Type: `Form_Definition`**

| Field Name | Field Type | Optional | Notes |
|------------|-----------|----------|-------|
| tenant | Tenant | No | Relationship to tenant |
| form_id | text | No | Unique identifier (e.g., "lovebox_application") |
| form_name | text | No | Display name (e.g., "Love Box Application") |
| enabled | yes/no | No | Whether form is active |
| description | text | Yes | Form description |
| program | Program | No | Related program (see Step 2) |
| fields | Form_Field (list) | No | List of form fields |
| sort_order | number | Yes | Display order |
| created_date | date | No | Auto-populated |
| modified_date | date | No | Auto-updated |

**Privacy Rules:**
```
Everyone else:
- View all fields: Current User's tenant = This Form_Definition's tenant
- Create/Modify: Current User's tenant = This Form_Definition's tenant AND Current User is admin
```

---

#### **Data Type: `Form_Field`**

| Field Name | Field Type | Optional | Notes |
|------------|-----------|----------|-------|
| form_definition | Form_Definition | No | Parent form |
| field_id | text | No | Unique within form (e.g., "applicant_name") |
| field_label | text | No | Display label (e.g., "Your Name") |
| field_type | option set | No | text, email, phone, select, multiselect, number, date |
| required | yes/no | No | Whether field is required |
| validation_rules | text | Yes | JSON string for custom validation |
| options | text (list) | Yes | For select/multiselect types |
| placeholder | text | Yes | Placeholder text |
| help_text | text | Yes | Additional guidance |
| sort_order | number | No | Field display order |

**Option Set: `field_type_options`**
- text
- email
- phone
- select
- multiselect
- number
- date

**Privacy Rules:**
```
Everyone else:
- View all fields: Current User's tenant = This Form_Field's form_definition's tenant
- Create/Modify: Current User's tenant = This Form_Field's form_definition's tenant AND Current User is admin
```

---

#### **Data Type: `Program`**

| Field Name | Field Type | Optional | Notes |
|------------|-----------|----------|-------|
| tenant | Tenant | No | Relationship to tenant |
| program_id | text | No | Unique identifier (e.g., "love_box") |
| program_name | text | No | Display name (e.g., "Love Box") |
| description | text | Yes | Program description |
| contact_email | email | No | Primary contact for program |
| enabled | yes/no | No | Whether program is active |
| sort_order | number | Yes | Display order |
| created_date | date | No | Auto-populated |

**Privacy Rules:**
```
Everyone else:
- View all fields: Current User's tenant = This Program's tenant
- Create/Modify: Current User's tenant = This Program's tenant AND Current User is admin
```

---

### Step 2: Update Existing Data Types

#### **Modify: `Form_Definition`**
Add relationship:
- `program` (Program, not optional) - Links form to program for routing

#### **Modify: `Form_Notification_Rule`**
Add relationship (if not exists):
- `program` (Program, not optional) - Links notification to program

#### **Modify: `Integration_Rule`**
Add relationship (if not exists):
- `program` (Program, not optional) - Links integration routing to program

---

## Section 1: Form Collection

### UI Components to Build

#### **1.1: Main Section Container**

Create a new group on your config page:

**Group: `group_form_collection`**
- Type: Column
- Width: 100%
- Background: White
- Visible: Current User's tenant's features:converted to text contains "conversational_forms"

---

#### **1.2: Section Header**

**Elements:**
- **Icon:** Text element "📝"
- **Title:** Text element "Form Collection"
- **Divider:** Shape (1px height, #e8e8e8)

**Layout:**
```
Row layout:
[📝 Icon] [Form Collection Title] --- Divider below
```

---

#### **1.3: Enable Toggle**

**Group: `group_form_toggle`**
- Layout: Row with space-between alignment

**Elements:**
- **Label:** Text "Form collection in chat enabled"
- **Toggle:** Checkbox input
  - Initial value: Current User's tenant's features:converted to text contains "conversational_forms"
  - Workflow on change:
    ```
    When Checkbox is changed:
      Make changes to Current User's tenant:
        features = replace "conversational_forms" with "" (if unchecked)
        features = features + ",conversational_forms" (if checked)

      Trigger S3 Config Sync workflow
    ```

---

#### **1.4: Forms List (Repeating Group)**

**Repeating Group: `rg_forms`**
- Data source: `Do a search for Form_Definitions`
  - Constraint: `tenant = Current User's tenant`
  - Sort by: `sort_order ascending`
- Layout: Column, full-width
- Style: List with 12px gap

**Cell Content (for each Form_Definition):**

**Group: `group_form_card`** (horizontal layout)
- Background: #fafafa
- Border: 1px solid #e8e8e8
- Border radius: 8px
- Padding: 14px 16px

Left side (flex-grow: 1):
- **Text: Form Name**
  - Content: `Current cell's Form_Definition's form_name`
  - Font size: 14px
  - Font weight: 500

- **Badge: Status**
  - Visible: `Current cell's Form_Definition's enabled is yes`
  - Text: "ACTIVE"
  - Background: #d4f4dd
  - Color: #1e7e34
  - Border radius: 4px
  - Padding: 3px 8px
  - Font size: 10px

- **Text: Metadata**
  - Content: `"Form ID: " & Current cell's Form_Definition's form_id & " | " & Current cell's Form_Definition's fields:count & " Fields | Program: " & Current cell's Form_Definition's program's program_name`
  - Font size: 11px
  - Color: #666

Right side:
- **Button: "Edit"**
  - Style: Secondary button
  - Workflow on click:
    ```
    When Button is clicked:
      Show popup: popup_edit_form
      Set state: selected_form = Current cell's Form_Definition
    ```

---

#### **1.5: Add New Form Button**

**Button: `btn_add_form`**
- Text: "+ Add New Form"
- Style: Primary button (blue background)
- Full width
- Margin top: 12px
- Workflow:
  ```
  When Button is clicked:
    Show popup: popup_edit_form
    Reset state: selected_form (to create new)
  ```

---

#### **1.6: Form Behavior Settings**

**Group: `group_form_behaviors`**
- Margin top: 24px

**Label:** "Form Behavior Settings"

**Toggle rows (3 total):**

1. **Show progress indicator**
   - Checkbox: `cb_show_progress`
   - Default: Yes
   - Saves to tenant config field: `form_behavior_show_progress`

2. **Allow skip optional fields**
   - Checkbox: `cb_allow_skip`
   - Default: Yes
   - Saves to tenant config field: `form_behavior_allow_skip`

3. **Show confirmation screen**
   - Checkbox: `cb_show_confirmation`
   - Default: Yes
   - Saves to tenant config field: `form_behavior_show_confirmation`

Each checkbox workflow:
```
When Checkbox is changed:
  Make changes to Current User's tenant:
    [respective field] = This checkbox's value

  Trigger S3 Config Sync workflow
```

---

### Popup: Edit Form

**Popup: `popup_edit_form`**

**Custom State:**
- `selected_form` (Form_Definition)
- `editing_field` (Form_Field)

**Layout:** Vertical, max-width 600px

**Elements:**

1. **Popup Title**
   - Text: "Edit Form" (if selected_form exists) OR "Create New Form"

2. **Input: Form Name**
   - Initial value: `This popup's selected_form's form_name`
   - Placeholder: "e.g., Love Box Application"

3. **Input: Form ID**
   - Initial value: `This popup's selected_form's form_id`
   - Placeholder: "e.g., lovebox_application"
   - Note: Lowercase, underscores only

4. **Dropdown: Program**
   - Choices: `Do a search for Programs (tenant = Current User's tenant, enabled = yes)`
   - Initial value: `This popup's selected_form's program`
   - Display: program_name

5. **Textarea: Description**
   - Initial value: `This popup's selected_form's description`
   - Placeholder: "Optional description"

6. **Toggle: Enabled**
   - Initial value: `This popup's selected_form's enabled`

7. **Divider**

8. **Label:** "Form Fields"

9. **Repeating Group: Fields**
   - Data source: `This popup's selected_form's fields:sorted by sort_order`
   - Cell content:
     - Field label, field type, required badge
     - Edit button, Delete button
     - Drag handle (for reordering)

10. **Button: "+ Add Field"**
    - Opens field editor popup

11. **Action Buttons:**
    - **Cancel** - Hides popup
    - **Save Form** - Triggers save workflow

---

**Workflow: Save Form**

```
When Button "Save Form" is clicked:

Step 1: Create or Update Form_Definition
  If This popup's selected_form is empty:
    Create a new thing: Form_Definition
      tenant = Current User's tenant
      form_id = Input form_id's value
      form_name = Input form_name's value
      program = Dropdown program's value
      description = Textarea description's value
      enabled = Toggle enabled's value
      created_date = Current date/time
      modified_date = Current date/time
      sort_order = Do a search for Form_Definitions:count + 1

  Otherwise:
    Make changes to This popup's selected_form:
      form_name = Input form_name's value
      program = Dropdown program's value
      description = Textarea description's value
      enabled = Toggle enabled's value
      modified_date = Current date/time

Step 2: Trigger S3 Config Sync
  Schedule API Workflow: sync_tenant_config_to_s3
    tenant_id = Current User's tenant's tenant_id

Step 3: Close popup and refresh
  Hide popup: popup_edit_form
  Reset relevant group
```

---

## Section 2: Programs & Interests

### UI Components to Build

#### **2.1: Main Section Container**

**Group: `group_programs`**
- Same styling as Section 1

**Section Header:**
- Icon: 🎯
- Title: "Programs & Interests"

**Info Text:**
"Programs are used for routing notifications and integrations based on applicant interest. Each program can have its own notification recipients and integration endpoints."

---

#### **2.2: Programs List (Repeating Group)**

**Repeating Group: `rg_programs`**
- Data source: `Do a search for Programs`
  - Constraint: `tenant = Current User's tenant`
  - Sort by: `sort_order ascending`

**Cell Content:**

**Group: `group_program_item`** (horizontal)
- Background: #fafafa
- Border: 1px solid #e8e8e8
- Border radius: 8px
- Padding: 12px 16px

Left side:
- **Text: Program Number & Name**
  - Content: `Current cell's index & ". " & Current cell's Program's program_name`
  - Font size: 14px
  - Font weight: 500

- **Text: Contact**
  - Content: `"Contact: " & Current cell's Program's contact_email`
  - Font size: 11px
  - Color: #666

Right side:
- **Button: "Edit"**
  - Workflow: Show popup_edit_program

---

#### **2.3: Add New Program Button**

**Button: `btn_add_program`**
- Text: "+ Add New Program"
- Style: Primary
- Full width
- Workflow: Show popup_edit_program

---

### Popup: Edit Program

**Popup: `popup_edit_program`**

**Custom State:**
- `selected_program` (Program)

**Elements:**

1. **Input: Program Name**
   - Initial: `This popup's selected_program's program_name`

2. **Input: Program ID**
   - Initial: `This popup's selected_program's program_id`
   - Lowercase, underscores

3. **Input: Contact Email**
   - Initial: `This popup's selected_program's contact_email`

4. **Textarea: Description**
   - Initial: `This popup's selected_program's description`

5. **Toggle: Enabled**
   - Initial: `This popup's selected_program's enabled`

6. **Action Buttons:**
   - Cancel, Save Program

**Workflow: Save Program**

```
When Button "Save Program" is clicked:

Step 1: Create or Update Program
  If This popup's selected_program is empty:
    Create a new thing: Program
      tenant = Current User's tenant
      program_id = Input program_id's value
      program_name = Input program_name's value
      contact_email = Input contact_email's value
      description = Textarea description's value
      enabled = Toggle enabled's value
      created_date = Current date/time
      sort_order = Do a search for Programs:count + 1

  Otherwise:
    Make changes to This popup's selected_program:
      [update all fields]

Step 2: Trigger S3 Config Sync

Step 3: Close popup
```

---

## Section 3: Notification Rules

### UI Components to Build

#### **3.1: Main Section Container**

**Group: `group_notification_rules`**

**Section Header:**
- Icon: 📧
- Title: "Notification Rules"

**Info Text:**
"Configure email notifications when forms are submitted based on program interest. Each rule sends an email to designated recipients when a submission matches the program criteria."

---

#### **3.2: Rules List (Repeating Group)**

**Repeating Group: `rg_notification_rules`**
- Data source: `Do a search for Form_Notification_Rules`
  - Constraint: `tenant_id = Current User's tenant's tenant_id`
  - Constraint: `enabled = "yes"`

**Cell Content:**

**Group: `group_rule_card`**
- Background: #fafafa
- Border: 1px solid #e8e8e8
- Border radius: 8px
- Padding: 14px 16px

Top row (horizontal):
- **Checkbox: Enabled**
  - Initial: `Current cell's Form_Notification_Rule's enabled = "yes"`
  - Workflow on change: Toggle enabled field

- **Text: Rule Title**
  - Content: `Current cell's Form_Notification_Rule's program's program_name & " Applications"`

- **Button: "Edit"**

Bottom section (indented 26px):
- **Text: Details**
  - Content:
    ```
    "Program: " & Current cell's program's program_name
    "Notify: " & Current cell's recipient_email
    "Template: " & Current cell's email_template_name
    ```
  - Font size: 12px
  - Color: #666
  - Line height: 1.8

---

#### **3.3: Add Notification Rule Button**

**Button: `btn_add_notification_rule`**
- Text: "+ Add Notification Rule"
- Style: Primary
- Full width

---

#### **3.4: Email Template Settings**

**Group: `group_email_templates`**
- Margin top: 24px

**Label:** "Email Template Settings"

**Button: "Configure Email Templates"**
- Links to Bubble's built-in email template editor
- URL: `/app/[app_name]/email`

---

### Popup: Edit Notification Rule

**Popup: `popup_edit_notification_rule`**

**Elements:**

1. **Dropdown: Program**
   - Choices: Programs for current tenant
   - Display: program_name

2. **Input: Recipient Email**
   - Can be comma-separated for multiple recipients

3. **Dropdown: Email Template**
   - Choices: List of available email templates
   - Or text input for template name

4. **Toggle: Enabled**

5. **Action Buttons:**
   - Cancel, Save Rule

**Workflow: Save Notification Rule**

```
Step 1: Create or Update Form_Notification_Rule
  Create/Update with field mappings

Step 2: Close popup
```

---

## Section 4: Integration Settings

### UI Components to Build

#### **4.1: Main Section Container**

**Group: `group_integration_settings`**

**Section Header:**
- Icon: 🔗
- Title: "Integration Settings"

**Info Text:**
"Connect form submissions to external systems via N8N webhooks. Configure integrations and routing rules to send data to Google Sheets, CRMs, or other platforms."

---

#### **4.2: Configured Integrations**

**Repeating Group: `rg_integrations`**
- Data source: `Do a search for Integration_Configs`
  - Constraint: `tenant_id = Current User's tenant's tenant_id`

**Cell Content:**

**Group: `group_integration_card`**
- Layout: Form card style (same as Section 1)

Left side:
- **Text: Integration Name**
  - Content: `Current cell's Integration_Config's integration_name`

- **Badge: Status**
  - "ACTIVE" if enabled

- **Text: Details**
  - Content:
    ```
    "Endpoint: " & Current cell's integration_type
    "URL: " & Current cell's endpoint_url
    "Last Test: " & Current cell's last_test_date:formatted as MM/dd/yyyy hh:mm am/pm & " (" & Current cell's last_test_status & ")"
    ```

Right side:
- **Button: "Edit"**
- **Button: "Test Connection"** (below Edit)

---

#### **4.3: Add Integration Button**

**Button: `btn_add_integration`**
- Text: "+ Add Integration"
- Style: Primary
- Full width

---

#### **4.4: Routing Rules**

**Label:** "Routing Rules"
- Margin top: 24px

**Repeating Group: `rg_routing_rules`**
- Data source: `Do a search for Integration_Rules`
  - Constraint: `tenant_id = Current User's tenant's tenant_id`
  - Constraint: `enabled = "yes"`

**Cell Content:**

**Group: `group_routing_rule_card`**
- Same style as notification rules

Top row:
- **Checkbox: Enabled**
- **Text: Rule Title**
  - Content: `Current cell's program's program_name & " → " & Current cell's integration_config's integration_name`
- **Button: "Edit"**

Bottom section:
- **Text: Details**
  - Content:
    ```
    "Program: " & Current cell's program's program_name
    "Integration: " & Current cell's integration_config's integration_name
    "Submissions Sent: " & Current cell's submissions_count
    ```

---

#### **4.5: Add Routing Rule Button**

**Button: `btn_add_routing_rule`**
- Text: "+ Add Routing Rule"
- Style: Primary
- Full width

---

### Popup: Edit Integration

**Popup: `popup_edit_integration`**

**Elements:**

1. **Input: Integration Name**
   - e.g., "Google Sheets"

2. **Dropdown: Integration Type**
   - Options: N8N Webhook, Zapier, Make.com, Custom API
   - Default: N8N Webhook

3. **Input: Endpoint URL**
   - Full webhook URL

4. **Group: Authentication Settings** (conditional)
   - Only visible if integration type requires auth
   - Input: API Key or Bearer Token

5. **Button: Test Connection**
   - Sends test payload to endpoint
   - Shows success/failure message

6. **Toggle: Enabled**

7. **Action Buttons:**
   - Cancel, Save Integration

**Workflow: Save Integration**

```
Step 1: Create or Update Integration_Config
  Create/Update with all fields

Step 2: Update last_modified timestamp

Step 3: Close popup
```

---

### Popup: Edit Routing Rule

**Popup: `popup_edit_routing_rule`**

**Elements:**

1. **Dropdown: Program** (multiselect)
   - Can select multiple programs for one rule
   - Uses "contains" matching logic

2. **Dropdown: Integration**
   - Single select from Integration_Configs

3. **Toggle: Enabled**

4. **Action Buttons:**
   - Cancel, Save Routing Rule

**Workflow: Save Routing Rule**

```
Step 1: Create or Update Integration_Rule
  tenant_id = Current User's tenant's tenant_id
  program = Dropdown program's value
  integration_config_id = Dropdown integration's unique id
  enabled = Toggle's value

Step 2: Close popup
```

---

## S3 Config Sync

### Backend Workflow: `sync_tenant_config_to_s3`

**Purpose:** Syncs Bubble database to S3 tenant config JSON

**Parameters:**
- `tenant_id` (text)

**Workflow Steps:**

#### **Step 1: Build Config JSON**

Create a custom JSON structure:

```json
{
  "tenant_id": "[tenant_id parameter]",
  "tenant_hash": "[Search for Tenants (tenant_id = tenant_id):first item's tenant_hash]",
  "features": {
    "conversational_forms": [true/false based on feature flag]
  },
  "conversational_forms": {
    "[form_id]": {
      "enabled": [true/false],
      "form_id": "[form_id]",
      "form_name": "[form_name]",
      "program": "[program_name]",
      "fields": [
        {
          "id": "[field_id]",
          "label": "[field_label]",
          "type": "[field_type]",
          "required": [true/false],
          "options": ["option1", "option2"],
          "placeholder": "[placeholder]",
          "help_text": "[help_text]"
        }
      ]
    }
  },
  "programs": [
    {
      "program_id": "[program_id]",
      "program_name": "[program_name]",
      "contact_email": "[contact_email]",
      "enabled": [true/false]
    }
  ],
  "form_behavior": {
    "show_progress": [true/false],
    "allow_skip_optional": [true/false],
    "show_confirmation": [true/false]
  }
}
```

**Bubble Implementation:**

Use the "API Connector" to make a JSON structure, then iterate through:

1. **Search for Form_Definitions** (tenant = parameter tenant_id)
   - For each form:
     - Add form object to conversational_forms
     - Search for form's fields
     - Build fields array

2. **Search for Programs** (tenant = parameter tenant_id)
   - For each program:
     - Add program object to programs array

3. **Get form behavior settings** from Tenant record

---

#### **Step 2: Upload to S3**

Use Bubble's S3 plugin or API Connector:

**S3 PUT Request:**
- Bucket: `myrecruiter-picasso`
- Key: `tenants/[tenant_id]/[tenant_id]-config.json`
- Body: JSON from Step 1
- Content-Type: `application/json`

**API Connector Setup:**

```
API Name: AWS S3 API
Authentication: AWS Signature V4
  - Access Key ID: [from AWS]
  - Secret Access Key: [from AWS]
  - Region: us-east-1
  - Service: s3

Call: PUT_Tenant_Config
  - Method: PUT
  - URL: https://myrecruiter-picasso.s3.amazonaws.com/tenants/<tenant_id>/<tenant_id>-config.json
  - Headers:
    - Content-Type: application/json
  - Body: <json_payload>
```

---

#### **Step 3: Log Success/Failure**

Add database record to track sync:

**Data Type: `Config_Sync_Log`**
- tenant_id (text)
- sync_timestamp (date)
- success (yes/no)
- error_message (text)

---

### When to Trigger S3 Sync

Trigger `sync_tenant_config_to_s3` workflow after:

1. Creating or updating a Form_Definition
2. Creating or updating a Program
3. Toggling any form behavior setting
4. Enabling/disabling conversational forms feature
5. Creating or updating form fields

**Note:** Consider debouncing multiple rapid changes using a "schedule this workflow" pattern with 5-second delay.

---

## Testing Checklist

### Section 1: Form Collection

- [ ] Enable/disable form collection toggle
- [ ] Create new form with all fields
- [ ] Edit existing form
- [ ] Add fields to form (text, email, phone, select)
- [ ] Reorder fields via drag-and-drop
- [ ] Delete fields from form
- [ ] Disable/enable individual forms
- [ ] Verify form appears in dropdown when creating notification/routing rules
- [ ] Toggle form behavior settings
- [ ] Verify S3 config updates after save

### Section 2: Programs & Interests

- [ ] Create new program
- [ ] Edit existing program
- [ ] Disable/enable program
- [ ] Verify program appears in form editor dropdown
- [ ] Verify program appears in notification rule editor
- [ ] Verify program appears in routing rule editor
- [ ] Verify S3 config includes programs array

### Section 3: Notification Rules

- [ ] Create notification rule for a program
- [ ] Edit existing notification rule
- [ ] Toggle notification rule enabled/disabled
- [ ] Verify multiple email recipients (comma-separated)
- [ ] Link to email template editor
- [ ] Test actual email sending (submit form via Picasso)

### Section 4: Integration Settings

- [ ] Create new integration (N8N webhook)
- [ ] Test connection to integration endpoint
- [ ] Edit integration endpoint URL
- [ ] Disable/enable integration
- [ ] Create routing rule (program → integration)
- [ ] Edit routing rule
- [ ] Toggle routing rule enabled/disabled
- [ ] Verify submissions_count increments after form submission
- [ ] Test end-to-end: Picasso → Lambda → Bubble → N8N → Google Sheets

### S3 Config Sync

- [ ] Verify JSON structure matches expected format
- [ ] Verify tenant_id and tenant_hash are correct
- [ ] Verify all forms appear in conversational_forms object
- [ ] Verify all fields appear in each form's fields array
- [ ] Verify programs array is populated
- [ ] Verify form_behavior settings are correct
- [ ] Download S3 config and validate JSON syntax
- [ ] Test Lambda reading updated config (trigger form in Picasso)

### Security & Permissions

- [ ] Non-admin users cannot access config page
- [ ] Users can only see/edit their own tenant's data
- [ ] Privacy rules prevent cross-tenant data access
- [ ] S3 upload uses secure credentials
- [ ] Tenant hash is NOT exposed in config admin UI

---

## Common Issues & Solutions

### Issue: S3 Upload Fails

**Symptoms:** Config changes save to Bubble but don't reach S3

**Solutions:**
1. Check AWS credentials in API Connector
2. Verify S3 bucket permissions allow PUT operations
3. Check bucket name and key path are correct
4. Review Bubble server logs for error details

---

### Issue: Form Not Appearing in Picasso

**Symptoms:** Form created in admin but not offered in chat

**Solutions:**
1. Verify form is enabled
2. Verify conversational_forms feature is enabled in Premium Features
3. Check S3 config has been updated (download and inspect)
4. Verify Lambda is reading latest config (check CloudWatch logs)
5. Clear any Lambda caches (redeploy or wait for cache TTL)

---

### Issue: Notifications Not Sending

**Symptoms:** Form submitted but no email received

**Solutions:**
1. Verify notification rule is enabled
2. Verify program matches form's program_interest
3. Check email address is correct
4. Review Bubble email logs
5. Verify Form_Notification_Rule has correct tenant_id

---

### Issue: Integration Not Triggering

**Symptoms:** Notification works but N8N doesn't receive data

**Solutions:**
1. Verify integration is enabled
2. Verify routing rule is enabled
3. Check program matching logic (contains vs exact match)
4. Test N8N endpoint URL directly with curl
5. Review Bubble API logs for send_to_integration workflow
6. Verify integration_config_id is correct in routing rule

---

## Next Steps

After completing this implementation:

1. **Build Analytics Dashboard** - Display form submissions data
2. **Add Bulk Operations** - Import/export forms and programs
3. **Create Form Templates** - Pre-built forms for common use cases
4. **Add Field Validation Builder** - Visual regex/rule builder
5. **Implement Form Versioning** - Track changes over time

---

## Related Documentation

- [BUBBLE_INTEGRATION_PLAYBOOK.md](./BUBBLE_INTEGRATION_PLAYBOOK.md) - Complete integration architecture
- [COMPLETE_CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md](./COMPLETE_CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md) - Forms implementation plan
- [COMPLETE_CONVERSATIONAL_FORMS_TEST_PLAN.md](./COMPLETE_CONVERSATIONAL_FORMS_TEST_PLAN.md) - Testing procedures

---

**End of Implementation Guide**
