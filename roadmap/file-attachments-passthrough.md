# File Attachments: Pass-Through Architecture

## Core Concept: Zero Storage, Maximum Utility

Picasso becomes a smart connector to existing storage, not a storage system itself.

## Architecture Overview

```
User → Picasso Widget → Client's Storage (Google Drive/SharePoint/Box)
                     ↓
                   AI Assistant (reads/helps but doesn't store)
```

## MVP Implementation Options

### Option A: Simple Share Link Handler
**User Flow:**
1. User clicks attachment icon
2. Widget shows: "Share a link to your file from Google Drive, Dropbox, or OneDrive"
3. User pastes link
4. AI can access file temporarily (if permissions allow)
5. AI provides help/answers
6. Link stored in conversation only (deleted after session)

**Code Example:**
```javascript
// In ChatProvider.jsx
const handleFileLink = async (url) => {
  // Validate it's a recognized service
  const service = detectStorageService(url); // google, dropbox, sharepoint
  
  // Use their API to get temporary access
  const fileAccess = await getTemporaryAccess(url, service);
  
  // Send to AI with metadata only
  await sendMessage({
    type: 'file_reference',
    url: url,
    service: service,
    fileName: fileAccess.name,
    fileType: fileAccess.mimeType,
    // Don't send content unless explicitly needed
  });
};
```

### Option B: OAuth Connection (More Complex but Smoother)
**User Flow:**
1. User clicks attachment icon
2. Widget shows: "Connect your Google Drive" (one-time)
3. OAuth flow in popup
4. User selects file from their drive
5. Picasso gets temporary read access
6. AI processes and forgets

**Benefits:**
- Better UX (file picker vs paste link)
- Can list user's files
- More secure (OAuth vs shared links)

**Drawbacks:**
- OAuth setup for each service
- More complex implementation
- Client needs to approve OAuth app

### Option C: Public Folder Reference (Simplest)
**User Flow:**
1. Organization sets up public folders with common documents
2. Chatbot knows about these folders
3. User asks: "I need the foster parent application"
4. Bot: "Here's the link to that document: [link to their Google Drive]"

**Implementation:**
```javascript
// In tenant config
{
  "tenant_id": "foster_village",
  "public_resources": {
    "foster_parent_application": "https://drive.google.com/...",
    "training_schedule": "https://drive.google.com/...",
    "faq_document": "https://drive.google.com/..."
  }
}
```

## Lightweight Features You Mentioned

### 1. Smart Checklists
```javascript
// User: "What do I need to become a foster parent?"
// Bot generates:
const checklist = {
  title: "Foster Parent Application Checklist",
  items: [
    { task: "Complete application form", link: config.public_resources.application },
    { task: "Schedule home study", action: "calendar_link" },
    { task: "Complete background check", link: config.public_resources.background }
  ],
  exportFormat: ['pdf', 'email', 'print']
};
```

### 2. Conditional Resource Sharing
```javascript
// Based on conversation context
if (context.discussing === 'training') {
  showResource({
    title: "Upcoming Training Sessions",
    link: config.public_resources.training_calendar,
    message: "Here's our training calendar. Would you like me to help you find a session that fits your schedule?"
  });
}
```

## Technical Implementation Plan

### Phase 1: Link Handler (1 week)
- Add link detection to input
- Validate storage service URLs
- Display file references in chat
- No actual file access yet

### Phase 2: Public Resources (1 week)
- Add to tenant config structure
- Create resource suggestion logic
- Build "quick links" UI component
- Track resource usage metrics

### Phase 3: Basic Integration (2-3 weeks)
- Google Drive read-only integration
- Temporary access tokens
- Basic file metadata display
- Security audit

### Phase 4: Enhanced Features (Future)
- Multiple storage providers
- File preview in widget
- Smart suggestions based on file type
- Accessibility improvements

## Security Considerations

1. **Never store file content**
2. **Access tokens expire after session**
3. **Audit trail of file access**
4. **Clear permission warnings**
5. **Rate limiting on file operations**

## Success Metrics

- Files referenced per conversation
- Public resource click-through rate
- Time saved vs manual document finding
- Zero data storage incidents

## Why This Works

1. **No Compliance Risk**: You're not storing anything
2. **Leverages Existing Systems**: Clients already use Google Drive/SharePoint
3. **Immediate Value**: Public resources can launch tomorrow
4. **Scalable**: Can add providers without changing architecture
5. **Clear Boundaries**: Picasso helps find/understand docs, doesn't manage them

## Next Steps

1. Add `public_resources` to tenant config structure
2. Build simple link handler UI
3. Create checklist component
4. Test with Foster Village's actual use cases
5. Measure if users even need more than this

## The Bottom Line

Start with public resource links and smart checklists. These provide 80% of the value with almost zero complexity. Only add file integrations if users are actually asking for it after using the simple features.