# Conversational Forms & Smart Response Cards - Implementation Plan v4

## Executive Summary

This document provides the updated implementation plan for adding conversational forms and smart response cards to the Picasso chat widget. The system leverages Knowledge Base (KB) content to automatically generate card inventories and form definitions, ensuring all interactions are grounded in real tenant capabilities. The admin console will be built in Bubble to maintain a single configuration management interface.

## Key Changes in v4

- **KB-Driven Card Strategy**: Cards are extracted from scraped tenant content, not AI-generated
- **No Lex Integration**: All forms handled conversationally within Picasso
- **Automatic Card Discovery**: Card inventory generated during tenant onboarding
- **Tenant-Specific Strategies**: Different card presentation based on organization type

## Architecture Overview

### Card Discovery Flow

```
Tenant Website Scraping
    ↓
KB Generation + Card Extraction
    ↓
S3 Config (KB + Card Inventory)
    ↓
Bedrock Uses KB / Picasso Uses Cards
    ↓
Context-Aware Card Selection
```

### Key Architecture Decisions

- **KB-Driven Cards**: Extract card opportunities from scraped content
- **Inventory-Based**: Pre-defined cards matched to conversation context
- **No Hallucination**: Cards only reference real tenant capabilities
- **Progressive Disclosure**: Cards appear based on user readiness scoring
- **Bubble Admin**: Manages notifications and card customization

## Implementation Timeline: 8 Days

## Day 0: Enhanced Onboarding Pipeline

### IMPLEMENTED: KB Analysis & Card Extraction

The card extraction system has been implemented in `picasso-webscraping/rag-scraper/`:

**Core Files:**
- `card-extractor.js` - Main extraction logic module
- `extract-cards-from-kb.js` - CLI tool for processing KB documents
- `merge-cards-to-config.js` - Merges cards into tenant config

**Actual Implementation:**
```javascript
// Extract cards from refined KB
node extract-cards-from-kb.js ./output/tenant-kb.md TENANT_ID

// Merge into config
node merge-cards-to-config.js tenant-cards.json tenant-config.json
```

The extraction identifies:
- Primary actions (volunteer, donate, contact)
- Requirements (age, commitment, background checks)
- Program cards
- Card presentation strategy (qualification_first vs exploration_first)

    # Extract primary CTAs (volunteer, donate, contact, etc.)
    for link in extract_links(kb_content):
        if any(keyword in link.url.lower()
               for keyword in ['volunteer', 'donate', 'apply', 'register', 'request']):
            inventory["primary_actions"].append({
                "url": link.url,
                "title": link.text,
                "trigger_phrases": generate_triggers(link.text),
                "frequency": count_occurrences(link.url, kb_content)
            })

    # Detect most important CTA by frequency
    if inventory["primary_actions"]:
        sorted_actions = sorted(inventory["primary_actions"],
                               key=lambda x: x["frequency"], reverse=True)
        inventory["primary_cta"] = sorted_actions[0]

    # Extract requirements (age, commitment, etc.)
    requirements_section = find_section(kb_content, ["requirements", "eligibility"])
    if requirements_section:
        inventory["requirements"] = parse_requirements(requirements_section)

    # Determine card strategy
    program_count = len(inventory["program_cards"])
    has_strict_requirements = len(inventory["requirements"]) > 2

    if program_count <= 3 and has_strict_requirements:
        inventory["card_strategy"] = "qualification_first"
    elif program_count > 5:
        inventory["card_strategy"] = "exploration_first"

    return inventory
```

### Real Examples from KB Analysis

**Foster Village Card Inventory:**
```json
{
  "tenant": "foster_village_austin",
  "card_strategy": "exploration_first",
  "primary_cta": {
    "title": "Get Involved",
    "url": "/volunteer",
    "trigger_phrases": ["help", "volunteer", "get involved"]
  },
  "primary_actions": [
    {
      "type": "volunteer_signup",
      "title": "Become a Volunteer",
      "url": "/volunteer"
    },
    {
      "type": "request_support",
      "title": "Request Support",
      "url": "/request-form",
      "for_audience": "caregivers"
    },
    {
      "type": "donation",
      "title": "Ways to Give",
      "url": "/ways-to-give"
    }
  ],
  "program_cards": [
    {
      "name": "Caregiver Support",
      "description": "Free support for foster families",
      "url": "/caregiver-support"
    },
    {
      "name": "Project SOOTHe",
      "description": "Sensory processing support",
      "url": "/project-soothe-program"
    }
  ]
}
```

**Atlanta Angels Card Inventory:**
```json
{
  "tenant": "atlanta_angels",
  "card_strategy": "qualification_first",
  "primary_cta": {
    "title": "Schedule Discovery Session",
    "url": "/volunteer",
    "frequency": 12,
    "emphasis": "high"
  },
  "requirements": [
    {
      "type": "age",
      "value": "22+",
      "critical": true
    },
    {
      "type": "commitment",
      "value": "1 year minimum",
      "critical": true,
      "emphasis": "MINIMUM ONE YEAR"
    }
  ],
  "program_cards": [
    {
      "name": "Love Box",
      "commitment": "2-3 hours/month",
      "description": "Support foster families"
    },
    {
      "name": "Dare to Dream",
      "commitment": "2 hours biweekly",
      "description": "Mentor youth 14-24"
    }
  ]
}
```

## Day 1-2: Smart Response Cards Enhancement

### Backend Enhancement
Create `lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js`:

```javascript
const enhanceResponse = async (bedrockResponse, context) => {
    const { tenant_hash, conversation_depth, kb_metadata } = context;

    // Load card inventory from S3/KB metadata
    const cardInventory = await loadCardInventory(tenant_hash);

    // Calculate user readiness (0-1 scale)
    const readinessScore = calculateReadiness({
        messageCount: conversation_depth,
        userIntent: extractIntent(bedrockResponse),
        mentionedTopics: extractTopics(bedrockResponse)
    });

    // Select appropriate cards based on strategy
    let selectedCards = [];

    if (cardInventory.card_strategy === "qualification_first") {
        // Atlanta Angels pattern: Show requirements first
        if (conversation_depth < 3 && mentionsVolunteering(bedrockResponse)) {
            selectedCards.push(createRequirementCard(cardInventory.requirements));
        } else if (readinessScore > 0.7) {
            selectedCards.push(cardInventory.primary_cta);
        }
    } else if (cardInventory.card_strategy === "exploration_first") {
        // Foster Village pattern: Show options first
        if (mentionsHelp(bedrockResponse)) {
            selectedCards = cardInventory.program_cards.slice(0, 3);
        }
        if (readinessScore > 0.8) {
            selectedCards.push(findRelevantAction(cardInventory.primary_actions));
        }
    }

    return {
        ...bedrockResponse,
        cards: selectedCards.slice(0, 3), // Max 3 cards
        readinessScore
    };
};

// Card builders based on inventory
const createRequirementCard = (requirements) => ({
    type: "info",
    style: "warning",
    title: "Important Requirements",
    content: requirements.map(r => `• ${r.type}: ${r.value}`),
    emphasis: requirements.some(r => r.critical) ? "high" : "normal"
});

const createActionCard = (action) => ({
    type: "action",
    title: action.title,
    subtitle: action.description,
    action: action.type,
    url: action.url,
    triggerForm: action.type.includes('form')
});
```

### Frontend Enhancement
Create `src/components/chat/ResponseCard.jsx`:

```jsx
const ResponseCard = ({ card, onAction }) => {
    const renderByType = () => {
        switch (card.type) {
            case 'info':
                return <InfoCard {...card} />;
            case 'action':
                return <ActionCard {...card} onClick={() => onAction(card)} />;
            case 'program':
                return <ProgramCard {...card} />;
            case 'requirement':
                return <RequirementCard {...card} emphasis={card.emphasis} />;
            case 'contact':
                return <ContactCard {...card} />;
            default:
                return null;
        }
    };

    return (
        <div className={`response-card ${card.style} ${card.emphasis}`}>
            {renderByType()}
        </div>
    );
};
```

## Day 3-4: Conversational Form System

### Form Discovery from KB
Forms are discovered during KB analysis and stored in the card inventory:

```python
def extract_form_definitions(kb_content, card_inventory):
    """Extract form fields from discovered action cards"""

    form_definitions = {}

    for action in card_inventory["primary_actions"]:
        if action["type"] in ["volunteer_signup", "request_support", "newsletter"]:
            # Analyze the linked page for form fields
            form_page = fetch_page(action["url"])
            fields = detect_form_fields(form_page)

            # Map to conversational prompts
            form_definitions[action["type"]] = {
                "fields": fields,
                "conversational_flow": generate_prompts(fields),
                "validation": extract_validation_rules(fields),
                "fulfillment": action["type"]  # Maps to Lambda handler
            }

    return form_definitions
```

### Conversational Form Components
Create `src/components/forms/ConversationalFormProvider.jsx`:

```jsx
const ConversationalFormProvider = ({ formType, onSubmit }) => {
    const [currentField, setCurrentField] = useState(0);
    const [responses, setResponses] = useState({});
    const [formDefinition] = useState(() => loadFormDefinition(formType));

    const handleFieldResponse = (value) => {
        const field = formDefinition.fields[currentField];

        // Validate response
        if (!validateField(field, value)) {
            return {
                error: true,
                message: field.validationMessage
            };
        }

        // Store response
        setResponses(prev => ({
            ...prev,
            [field.name]: value
        }));

        // Move to next field or submit
        if (currentField < formDefinition.fields.length - 1) {
            setCurrentField(currentField + 1);
            return {
                nextPrompt: formDefinition.fields[currentField + 1].prompt
            };
        } else {
            return handleSubmit();
        }
    };

    return (
        <FormContext.Provider value={{
            currentField: formDefinition.fields[currentField],
            progress: (currentField + 1) / formDefinition.fields.length,
            handleResponse: handleFieldResponse,
            responses
        }}>
            {children}
        </FormContext.Provider>
    );
};
```

### Example Form Definitions

**Foster Village Request Support Form:**
```json
{
  "type": "request_support",
  "fields": [
    {
      "name": "caregiver_name",
      "prompt": "What's your name?",
      "type": "text",
      "required": true
    },
    {
      "name": "family_size",
      "prompt": "How many children are in your care?",
      "type": "number",
      "validation": "min:1,max:10"
    },
    {
      "name": "need_type",
      "prompt": "What type of support do you need?",
      "type": "select",
      "options": ["Clothing", "School Supplies", "Furniture", "Other"],
      "allowMultiple": true
    },
    {
      "name": "urgency",
      "prompt": "How urgent is this need?",
      "type": "select",
      "options": ["Immediate", "This week", "This month"],
      "triggers_notification": true
    }
  ]
}
```

**Atlanta Angels Volunteer Form:**
```json
{
  "type": "volunteer_signup",
  "qualification_gates": [
    {
      "field": "age",
      "prompt": "First, I need to verify - are you at least 22 years old?",
      "validation": "boolean:true",
      "failure_message": "Volunteers must be at least 22. Consider our Angel Allies program instead."
    },
    {
      "field": "commitment",
      "prompt": "Can you commit to at least ONE FULL YEAR of volunteering?",
      "validation": "boolean:true",
      "failure_message": "We require a minimum one-year commitment to protect the children we serve.",
      "emphasis": "high"
    }
  ],
  "fields": [
    {
      "name": "program_choice",
      "prompt": "Which program interests you more?",
      "type": "select",
      "options": ["Love Box (support families)", "Dare to Dream (mentor youth)"]
    },
    {
      "name": "full_name",
      "prompt": "Great choice! What's your full name?",
      "type": "text",
      "required": true
    },
    {
      "name": "email",
      "prompt": "What's your email address?",
      "type": "email",
      "required": true
    },
    {
      "name": "phone",
      "prompt": "And a phone number where we can reach you?",
      "type": "tel",
      "required": true
    }
  ]
}
```

## Day 5: Backend Form Processing & Notifications

### Form Handler in Master Function
Update `lambda/Master_Function_Staging/form_handler.py`:

```python
def handle_form_submission(form_data, tenant_config):
    """Process conversational form submissions"""

    form_type = form_data.get('form_type')
    responses = form_data.get('responses')
    tenant_hash = form_data.get('tenant_hash')

    # Load notification rules from config
    notification_config = tenant_config.get('conversational_forms', {}).get('notifications', {})

    # Check for high-priority triggers
    if is_high_priority(form_type, responses):
        send_immediate_notifications(notification_config, form_data)

    # Store submission
    submission_id = store_submission(tenant_hash, form_type, responses)

    # Route to appropriate fulfillment
    if form_type == 'volunteer_signup':
        # Create lead in CRM
        create_volunteer_lead(responses, tenant_config)
        # Send welcome email
        send_volunteer_welcome(responses['email'], tenant_config)

    elif form_type == 'request_support':
        # Notify support team
        notify_support_team(responses, notification_config)
        # Create ticket in support system
        create_support_ticket(responses, tenant_config)

    return {
        'submission_id': submission_id,
        'next_steps': get_next_steps(form_type, tenant_config)
    }
```

### Multi-Channel Notifications
```python
def send_notifications(config, form_data, priority='normal'):
    """Send notifications through configured channels"""

    notifications_sent = []

    # Email notifications
    if config.get('email', {}).get('enabled'):
        for recipient in config['email']['recipients']:
            # Use different templates based on priority
            template = 'urgent' if priority == 'high' else 'standard'
            send_email(
                to=recipient,
                subject=config['email']['subject'].format(**form_data),
                template=template,
                data=form_data
            )
            notifications_sent.append(f"email:{recipient}")

    # SMS for high-priority only
    if priority == 'high' and config.get('sms', {}).get('enabled'):
        usage = get_monthly_sms_usage(tenant_hash)
        limit = config['sms'].get('monthly_limit', 100)

        if usage < limit:
            for phone in config['sms']['recipients']:
                send_sms(
                    to=phone,
                    message=config['sms']['template'].format(**form_data)[:160]
                )
                notifications_sent.append(f"sms:{phone}")
                increment_sms_usage(tenant_hash)

    # Webhook for integrations
    if config.get('webhook', {}).get('enabled'):
        webhook_response = call_webhook(
            url=config['webhook']['url'],
            data=form_data,
            headers=config['webhook'].get('headers', {})
        )
        notifications_sent.append(f"webhook:{webhook_response.status}")

    return notifications_sent
```

## Day 6: Bubble Admin Console Updates

### Admin Configuration for Cards and Forms

The Bubble admin will manage both notifications AND card customization:

#### Card Inventory Manager
**Bubble Page: `admin_cards`**

Elements to create:
- **Card Inventory Display**
  - Repeating group showing discovered cards
  - Toggle to enable/disable specific cards
  - Edit triggers and prompts for each card
  - Reorder card priority

- **Form Field Editor**
  - View discovered form fields
  - Mark fields as required/optional
  - Customize conversation prompts
  - Add validation rules

#### Bubble Workflows

**Workflow: Update Card Settings**
```
Trigger: "Save Card Settings" clicked

Actions:
1. API Call to Master_Function:
   POST /update_card_inventory
   {
     "tenant_hash": current_tenant,
     "card_updates": {
       "volunteer_signup": {
         "enabled": true,
         "priority": 1,
         "custom_title": "Join Our Team!"
       }
     }
   }
2. Show success message
```

**Workflow: Test Card Display**
```
Trigger: "Preview Card" clicked

Actions:
1. Display card preview in popup
2. Show sample conversation flow
3. Allow editing of appearance
```

## Day 7: Integration Testing

### Test Scenarios

1. **KB → Card Extraction Pipeline**
   - Scrape test sites (Foster Village, Atlanta Angels)
   - Verify card inventory generation
   - Confirm correct strategy selection

2. **Card Display Logic**
   - Test qualification_first strategy (Atlanta Angels)
   - Test exploration_first strategy (Foster Village)
   - Verify readiness scoring triggers correct cards

3. **Form Conversations**
   - Complete volunteer signup with gates
   - Submit support request with urgency
   - Verify field validation and error handling

4. **Notification Delivery**
   - Test high-priority triggers
   - Verify SMS limits enforced
   - Confirm webhook integrations

5. **End-to-End Flow**
   - User sees card → Clicks action → Completes form → Notifications sent
   - Verify all data properly stored and routed

### Testing Checklist

**Card Extraction:**
- [ ] KB analysis extracts primary CTAs
- [ ] Requirements properly identified
- [ ] Card strategy correctly determined
- [ ] Form fields discovered from linked pages

**Card Display:**
- [ ] Cards appear at appropriate readiness levels
- [ ] Maximum 3 cards shown at once
- [ ] Emphasis styling works correctly
- [ ] Cards match conversation context

**Conversational Forms:**
- [ ] Qualification gates block unqualified users
- [ ] Field validation provides helpful errors
- [ ] Progress indicator accurate
- [ ] Form data properly collected

**Notifications:**
- [ ] Email notifications delivered
- [ ] SMS respects monthly limits
- [ ] High-priority triggers immediate send
- [ ] Webhook payloads formatted correctly

## Day 8: Documentation and Deployment

### COMPLETED: Documentation Updates
- ✅ Updated CLAUDE.md files with card extraction workflow
- ✅ Created CARD_EXTRACTION.md documentation
- ✅ Documented form definition schema
- ✅ Created example templates and mockups

### IMPLEMENTED: Deployment Pipeline
1. **Lambda Deployment**: `deploy_tenant_stack` creates base config
2. **Card Extraction**: Standalone process after KB refinement
3. **Form Definitions**: Explicit JSON with field definitions
4. **Config Merge**: Combines cards + forms into tenant config
5. **S3 Upload**: Enhanced config deployed to S3

### Actual Workflow:
```bash
# 1. Deploy tenant (creates base config)
aws lambda invoke deploy_tenant_stack --payload '{"tenant_id": "TENANT_ID"}'

# 2. Scrape and refine KB
node scrape-tenant-comprehensive.js

# 3. Extract cards
node extract-cards-from-kb.js tenant-kb.md TENANT_ID

# 4. Define forms (manual or template-based)
# Edit tenant-forms.json

# 5. Merge everything
node merge-cards-to-config.js tenant-cards.json tenant-config.json

# 6. Upload to S3
aws s3 cp tenant-config-enhanced.json s3://bucket/tenants/TENANT_ID/
```

## Architecture Benefits

### Why KB-Driven Cards

1. **No Hallucination**: Cards only reference real capabilities
2. **Automatic Updates**: Rescraping updates card inventory
3. **Tenant-Specific**: Each org gets appropriate strategy
4. **Grounded in Reality**: Forms match actual website forms
5. **Progressive Enhancement**: Start simple, add AI later

### Migration Path for Lex Clients

For clients currently on Lex who want to migrate:

1. **Extract Lex Intent Structure**
```python
lex_intents = get_lex_bot_definition(bot_id)
form_definitions = convert_lex_to_conversational(lex_intents)
```

2. **Map Slots to Form Fields**
```python
for slot in lex_intent['slots']:
    form_field = {
        'name': slot['name'],
        'prompt': generate_conversational_prompt(slot),
        'validation': map_slot_type_to_validation(slot['type'])
    }
```

3. **Preserve Fulfillment Logic**
- Keep existing Lambda fulfillment handlers
- Route form submissions to same endpoints
- Maintain data structure compatibility

## Success Metrics

### Technical KPIs
- Card extraction accuracy >90%
- Card selection relevance >85%
- Form completion rate >70%
- Notification delivery rate >99%

### Business KPIs
- Volunteer conversion +25%
- Support request clarity +40%
- User engagement +30%
- Admin configuration time -50%

## Risk Mitigation

### Potential Risks and Mitigations

1. **Risk**: KB extraction misses important cards**
   - Mitigation: Manual review process in Bubble admin
   - Fallback: Admin can manually add cards

2. **Risk**: Wrong card strategy selected**
   - Mitigation: Allow admin override in configuration
   - Monitor: Track card engagement metrics

3. **Risk**: Form fields incorrectly extracted**
   - Mitigation: Form field editor in Bubble
   - Validation: Test forms before enabling

4. **Risk**: Notification overload**
   - Mitigation: Built-in rate limiting
   - Controls: Admin-set thresholds

## Implementation Status

### ✅ Completed Components
- **Card Extraction System**: Fully implemented in `picasso-webscraping/rag-scraper/`
- **Configuration Pipeline**: Base config → Card extraction → Form definitions → Merge
- **Documentation**: CLAUDE.md files updated, CARD_EXTRACTION.md created
- **Visual Mockups**: HTML mockups showing real extracted cards

### 🚧 In Progress
- **Frontend Integration**: Connecting cards to Picasso chat UI
- **Form Collection**: Implementing conversational data collection
- **Lambda Updates**: Integrating form processing in Master_Function_Staging

### 📋 Next Steps
- Deploy card-enhanced configs to production tenants
- Implement progressive disclosure based on readiness scores
- Add form validation and error handling
- Set up notification routing

## Conclusion

This KB-driven approach to conversational forms and smart response cards provides a robust, scalable solution that:
- Automatically adapts to each tenant's actual capabilities
- Eliminates hallucination risks through inventory-based cards
- Provides clear implementation path with concrete examples
- Maintains flexibility for future AI enhancements
- Simplifies architecture by removing Lex dependency

The implementation leverages existing infrastructure while adding powerful new capabilities for structured data collection directly within the conversational interface.

---

*Document Version: 4.1*
*Last Updated: September 2024*
*Implementation Status: Card extraction complete, forms integration in progress*
*Key Changes: Added implementation status, updated with actual file paths and tools*