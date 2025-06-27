# Amazon Lex Integration Guide for Picasso

## Current State

Based on the Lambda code analysis, you already have:
- ✅ Dual-format Lambda that handles both Lex and HTTP requests
- ✅ Session management for Lex conversations
- ✅ Markdown response formatting for Lex
- ✅ Knowledge base integration via Bedrock

## Architecture Overview

```
Picasso Widget → Lambda (Master_Function) → Amazon Lex
                     ↓                           ↓
                HTTP Format                 Lex Format
                     ↓                           ↓
              intent_router.py ← handles both → intent_router.py
                     ↓                           ↓
               Bedrock/Claude              Bedrock/Claude
```

## What's Needed for Full Integration

### 1. Lex Bot Configuration

**Required Lex V2 Bot Structure:**
```yaml
Bot:
  Name: MyRecruiterBot
  Languages: 
    - en_US
  DataPrivacy:
    ChildDirectedTreatment: false  # Important for foster care
  
Intent:
  Name: GeneralInquiry
  SampleUtterances:
    - "I need help with {query}"
    - "Can you tell me about {query}"
    - "{query}"
  Slots:
    - Name: query
      Type: AMAZON.FreeFormInput
      Required: true
  
  FulfillmentCodeHook:
    Enabled: true
    FulfillmentUri: arn:aws:lambda:us-east-1:xxx:function:Master_Function
```

### 2. Lambda Permission Update

```bash
# Grant Lex permission to invoke your Lambda
aws lambda add-permission \
  --function-name Master_Function \
  --statement-id AllowLexInvoke \
  --action lambda:InvokeFunction \
  --principal lexv2.amazonaws.com \
  --source-arn "arn:aws:lex:us-east-1:xxx:bot/*/alias/*"
```

### 3. Picasso Widget Updates

**Option A: Direct Lex Integration (More Complex)**
```javascript
// In ChatProvider.jsx
import { LexRuntimeV2Client, RecognizeTextCommand } from "@aws-sdk/client-lex-runtime-v2";

const lexClient = new LexRuntimeV2Client({
  region: "us-east-1",
  credentials: {
    // Temporary credentials from your backend
  }
});

const sendToLex = async (message, sessionId) => {
  const command = new RecognizeTextCommand({
    botId: config.lex?.botId,
    botAliasId: config.lex?.botAliasId,
    localeId: "en_US",
    sessionId: sessionId,
    text: message,
    sessionState: {
      sessionAttributes: {
        tenant_hash: config.tenant_hash
      }
    }
  });
  
  const response = await lexClient.send(command);
  return response;
};
```

**Option B: Lambda Proxy (Recommended)**
```javascript
// Keep using your existing HTTP endpoint
// Lambda already handles Lex format conversion

const sendMessage = async (message) => {
  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_hash: tenantHash,
      user_input: message,
      session_id: sessionId,
      use_lex: config.features?.use_lex || false  // Feature flag
    })
  });
  
  return response.json();
};
```

### 4. Lambda Modifications for Better Lex Support

**Add Lex-specific features to intent_router.py:**
```python
def route_intent(event, config=None):
    # Detect if this is a Lex request
    is_lex_request = "sessionState" in event
    
    if is_lex_request:
        # Extract Lex-specific data
        intent_name = event.get("currentIntent", {}).get("name")
        slots = event.get("currentIntent", {}).get("slots", {})
        
        # Handle different intents if needed
        if intent_name == "BookAppointment":
            return handle_appointment_booking(event, config)
        elif intent_name == "CheckStatus":
            return handle_status_check(event, config)
    
    # Continue with existing logic...
```

### 5. Enhanced Features with Lex

**A. Multi-turn Conversations**
```python
# In response_formatter.py
def format_lex_markdown_response(text, session_attributes):
    # Add conversation state
    dialog_action = {
        "type": "ElicitSlot" | "ConfirmIntent" | "Close",
        "fulfillmentState": "Fulfilled" | "Failed" | "InProgress"
    }
    
    # For follow-up questions
    if needs_clarification(text):
        dialog_action["type"] = "ElicitSlot"
        dialog_action["slotToElicit"] = "additionalInfo"
```

**B. Intent Recognition**
```yaml
Intents:
  - Name: ScheduleHomeStudy
    Utterances:
      - "I need to schedule a home study"
      - "When can someone visit my home"
  
  - Name: CheckApplicationStatus  
    Utterances:
      - "What's the status of my application"
      - "Has my background check cleared"
  
  - Name: GetTrainingInfo
    Utterances:
      - "What training do I need"
      - "When is the next orientation"
```

**C. Context Preservation**
```python
# Use Lex session attributes for context
session_attributes = {
    "tenant_hash": tenant_hash,
    "conversation_topic": "foster_parent_application",
    "last_intent": "CheckStatus",
    "user_stage": "pre_application"
}
```

## Benefits of Lex Integration

1. **Better Intent Understanding**
   - Pre-built intents for common queries
   - Slot filling for structured data collection
   - Multi-language support

2. **Session Management**
   - Built-in conversation state
   - Context preservation across turns
   - Automatic timeout handling

3. **Analytics**
   - Conversation metrics in Lex console
   - Intent usage statistics
   - Failure analysis

4. **Voice Support**
   - Connect to Amazon Connect for voice
   - Same bot works for chat and phone
   - Consistent experience across channels

## Implementation Phases

### Phase 1: Basic Integration (1 week)
- Create Lex bot with single GeneralInquiry intent
- Update Lambda permissions
- Test with Lex console
- Keep Picasso using HTTP endpoint

### Phase 2: Enhanced Intents (2 weeks)
- Add specific intents for common queries
- Implement slot filling for forms
- Add conversation flows
- Update Lambda to handle intent routing

### Phase 3: Picasso Integration (1 week)
- Add Lex configuration to tenant config
- Implement feature flag for Lex usage
- Update ChatProvider for Lex format
- Test end-to-end

### Phase 4: Advanced Features (2 weeks)
- Multi-turn conversations
- Voice integration setup
- Analytics dashboard
- A/B testing Lex vs direct

## Configuration in Tenant Settings

```json
{
  "features": {
    "use_lex": true,
    "lex_voice": false
  },
  "integrations": {
    "lex": {
      "bot_id": "MYRECRUITER",
      "bot_alias_id": "PROD",
      "region": "us-east-1",
      "intents": {
        "general": true,
        "appointments": true,
        "status_check": true
      }
    }
  }
}
```

## Testing Strategy

1. **Lambda Testing**
   ```bash
   # Test Lex format
   aws lambda invoke \
     --function-name Master_Function \
     --payload file://test-lex-event.json \
     response.json
   ```

2. **Lex Console Testing**
   - Test each intent with sample utterances
   - Verify session attributes pass through
   - Check markdown formatting in responses

3. **End-to-End Testing**
   - Enable Lex for test tenant
   - Verify Picasso sends correct format
   - Check response handling
   - Test conversation flows

## Considerations

1. **Cost**: Lex charges per request ($0.004 per request)
2. **Latency**: Additional hop might add 50-100ms
3. **Complexity**: More moving parts to maintain
4. **Benefits**: Better NLU, session management, analytics

## Quick Win: Hybrid Approach

Start with:
1. Keep HTTP endpoint as primary
2. Add Lex bot for specific high-value intents
3. Route to Lex only for recognized patterns
4. Fall back to direct Claude for general chat

This gives you Lex benefits without full migration complexity.