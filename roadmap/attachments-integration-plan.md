# Attachments Integration Plan

## Architecture Overview

```
Tenant Settings Portal
    ↓ (configures)
Config.json
    ↓ (enables)
Picasso Widget → Google/Microsoft APIs → Client's Storage
    ↓ (temporary access)
AI Assistant (reads but doesn't store)
```

## Tenant Configuration Structure

```json
{
  "tenant_hash": "fo85e6a06dcdf4",
  "features": {
    "attachments": true,
    "media_uploads": true
  },
  "integrations": {
    "storage": {
      "provider": "google", // or "microsoft"
      "auth": {
        "client_id": "tenant-specific-oauth-client-id",
        "tenant_id": "microsoft-tenant-id", // for Microsoft only
        "scopes": ["drive.readonly", "files.read"]
      },
      "settings": {
        "allowed_file_types": [".pdf", ".doc", ".docx", ".jpg", ".png"],
        "max_file_size_mb": 10,
        "session_duration_minutes": 30
      }
    }
  }
}
```

## Settings Portal UI

### Storage Integration Section
```
┌─ Attachments & Media ─────────────────────────────────┐
│                                                        │
│  Enable Attachments      [✓]                          │
│  Enable Media           [✓]                          │
│                                                        │
│  Storage Provider:                                     │
│  ○ Google Drive                                       │
│  ● Microsoft OneDrive                                  │
│  ○ Both                                                │
│                                                        │
│  [Configure Microsoft Integration]                     │
│                                                        │
│  Allowed File Types:                                   │
│  ✓ Documents (.pdf, .doc, .docx)                     │
│  ✓ Images (.jpg, .png)                               │
│  ☐ Spreadsheets (.xls, .xlsx)                        │
│  ☐ Other: ____________                               │
│                                                        │
│  Max File Size: [10] MB                               │
│                                                        │
│  [Save Changes]                                        │
└────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Integration (2 weeks)

**Backend API Endpoints:**
```javascript
// OAuth flow initiation
POST /api/integrations/storage/auth
{
  "provider": "google",
  "tenant_hash": "...",
  "redirect_uri": "..."
}

// Token exchange
POST /api/integrations/storage/token
{
  "code": "oauth-code",
  "tenant_hash": "..."
}

// File access
GET /api/integrations/storage/file
{
  "file_id": "...",
  "provider": "google",
  "tenant_hash": "...",
  "session_token": "..."
}
```

**Widget Integration:**
```javascript
// In AttachmentMenu.jsx
const handleAttachment = async () => {
  if (!config.integrations?.storage) {
    showMessage("Attachments not configured for your organization");
    return;
  }

  const provider = config.integrations.storage.provider;
  
  if (provider === 'google') {
    const picker = new google.picker.PickerBuilder()
      .addView(google.picker.ViewId.DOCS)
      .setOAuthToken(await getSessionToken())
      .setCallback(handleFilePicked)
      .build();
    picker.setVisible(true);
  } else if (provider === 'microsoft') {
    // Similar for OneDrive picker
  }
};
```

### Phase 2: Security & Session Management (1 week)

**Session Token Flow:**
1. User clicks attachment button
2. Widget requests session token from backend
3. Backend validates tenant config
4. Creates temporary access token (30 min TTL)
5. Returns scoped token to widget
6. Widget uses token for picker/API calls
7. Token auto-expires, no cleanup needed

**Security Measures:**
```javascript
// Backend token generation
const generateSessionToken = async (tenantHash, userId) => {
  // Verify tenant has integration enabled
  const config = await getTenantConfig(tenantHash);
  if (!config.features.attachments) {
    throw new Error('Attachments not enabled');
  }

  // Create time-limited token
  const token = await createOAuthToken({
    scopes: config.integrations.storage.auth.scopes,
    expires_in: config.integrations.storage.settings.session_duration_minutes * 60,
    tenant_restrictions: {
      allowed_domains: config.allowed_domains,
      file_type_restrictions: config.integrations.storage.settings.allowed_file_types
    }
  });

  return token;
};
```

### Phase 3: AI Integration (1 week)

**File Context for AI:**
```javascript
// When file is selected
const handleFilePicked = async (data) => {
  if (data.action === google.picker.Action.PICKED) {
    const file = data.docs[0];
    
    // Send reference to chat, not content
    await addMessage({
      type: 'user',
      content: `I've shared a file: ${file.name}`,
      attachments: [{
        id: file.id,
        name: file.name,
        type: file.mimeType,
        size: file.sizeBytes,
        provider: 'google',
        reference_url: file.url
      }]
    });

    // AI can now reference this file
    // Backend can fetch content if needed for context
  }
};
```

## Benefits of This Approach

1. **Client Control**: They manage their own OAuth apps and permissions
2. **Zero Storage**: You never store files, just temporary references
3. **Provider Flexibility**: Easy to add Box, Dropbox, etc.
4. **Compliance Friendly**: All data stays in client's systems
5. **Simple Revocation**: Client can revoke OAuth app anytime

## Quick Wins to Ship First

While building the full OAuth integration, you could ship these immediately:

### 1. Link Paste Handler (1 day)
```javascript
// Detect and handle storage links
const handleMessage = (text) => {
  const driveLink = detectDriveLink(text);
  if (driveLink) {
    return {
      content: text,
      attachments: [{
        type: 'link',
        url: driveLink.url,
        provider: driveLink.provider
      }]
    };
  }
};
```

### 2. Public Resource Links (2 days)
Add to settings portal:
```
┌─ Public Resources ────────────────────────────────────┐
│                                                        │
│  Application Form:                                     │
│  [https://drive.google.com/your-form____]            │
│                                                        │
│  FAQ Document:                                         │
│  [https://docs.google.com/your-faq_____]             │
│                                                        │
│  + Add Resource                                        │
└────────────────────────────────────────────────────────┘
```

## Success Metrics

- Attachments shared per conversation
- Time to resolution for document-related queries  
- Zero file storage incidents
- Client satisfaction with integration setup

## The Bottom Line

This approach gives clients full control while keeping your infrastructure lean. They manage their own:
- OAuth applications
- Permission scopes
- File access policies
- Storage costs

You just provide the pipes to connect everything. Perfect separation of concerns.