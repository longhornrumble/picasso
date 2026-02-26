# Intercom Fin Architecture Research

Research conducted February 2026 to validate the Picasso Workflow Engine Architecture against Intercom's production system. Findings informed revisions to `docs/WORKFLOW_ENGINE_ARCHITECTURE.md`.

---

## 1. Fin AI Engine Internals

### Three-Phase Query Pipeline

The Fin AI Engine processes every query through three sequential phases:

**Phase 1 — Query Refinement:**
- Filters unsafe content
- Optimizes the customer message to make it more searchable for the LLM
- Checks for triggerable Workflow automations and pre-configured Custom Answers before passing to RAG
- This is a pre-processing step that Picasso does not have — raw user messages go directly to KB retrieval

**Phase 2 — Response Generation (RAG):**
- Bespoke retrieval augmented generation architecture
- Searches three information sources: Content (help articles, PDFs, HTML/URLs, past conversations), Data (internal/external for personalization), Integrations & actions (third-party systems)
- Retrieved information is integrated and augmented with the optimized query before the model generates answers

**Phase 3 — Accuracy Validation:**
- Validates responses against original queries
- Checks confidence levels and whether answers are grounded in knowledge resources
- This post-generation validation step is another capability Picasso does not have

### Model Layer

Fin uses **multiple specialized models**, not one general-purpose LLM:
- Retrieval models (for RAG)
- Rerankers (for relevance scoring)
- Summarizers
- Escalation detectors (dedicated ModernBERT model)
- Response interpreters
- Custom LLMs trained on real customer service conversations

**Source:** [The Fin AI Engine](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine)

---

## 2. Fin Attributes System

### How Classification Works

Fin Attributes are constrained classification — human defines taxonomy, AI classifies from a closed list:

1. Operator creates an attribute (e.g., "Issue type")
2. Operator defines possible values with natural language descriptions (e.g., "Billing: Customer has questions about charges, invoices, or payment methods")
3. Fin classifies conversations into these predefined buckets
4. The description text is what guides classification accuracy

### Detection Timing

Attributes are **not detected on every message**. Fin detects at key moments:
- When handing off to a teammate
- When the customer expresses resolution (positive feedback)
- When a customer becomes inactive

This is different from our plan (classify every message) and represents a cost optimization.

### Conditional (Hierarchical) Attributes

Fin supports parent/dependent attribute relationships:
- "Delivery Carrier" only appears when "Issue" = "Delivery"
- The controlling attribute must be a list data type
- Limited to 100 conditions per dependent attribute
- Cannot use AND logic for conditional visibility
- Changing a controlling attribute automatically removes dependent attribute values

This enables progressively more specific classification without overwhelming the initial classification with too many options.

### Using Attributes in Workflows

- Attributes are **only detected after a Fin block runs** — cannot be used before Fin is involved
- After detection, attributes power workflow branching conditions
- Attributes combine with existing person/company/conversation data for routing decisions
- Teammates can manually override attribute values in the inbox

**Sources:**
- [How to create Fin Attributes](https://www.intercom.com/help/en/articles/11680403-how-to-create-fin-attributes)
- [Using Fin Attributes in workflows, reports, and the inbox](https://www.intercom.com/help/en/articles/12397045-using-fin-attributes-in-workflows-reports-and-the-inbox)
- [Conditional conversation attributes](https://fin.ai/help/en/articles/11646220-how-to-use-conditional-conversation-attributes)

---

## 3. Workflow Engine

### Core Architecture

Workflows are visual automation tools with six trigger categories:
1. Conversation Start ("customer opens a new conversation")
2. Conversation Progress ("during a conversation")
3. Internal Operations ("in internal processes")
4. Customer Actions ("from customer-facing actions")
5. Ticket Events ("from ticket-only events")
6. Workflow Chaining ("from another workflow via reusable workflows")

### Critical Constraint: One Workflow at a Time

**"Only one workflow with customer-facing content can be running at any point."** If conversation conditions change, another workflow can jump in. Background workflows (non-customer-facing) can run in parallel.

### Branching Logic

- Sequential if/else evaluation
- First match wins
- Always has an "Else" branch
- Conditions can use: person data, company data, message data, conversation data, capacity, Fin Attributes
- **Can combine multiple conditions with AND logic** within a single branch (e.g., "Last seen < 14 days AND browser language is English")
- No deeply nested boolean trees

### Actions Available

- AI agent responses ("Let Fin Answer" steps)
- Customer attribute collection/updates
- Ticket operations (creation, assignment, closure)
- Data connector integrations (external API calls)
- Conversation tagging
- Internal teammate mentions
- Route to team/inbox

### Reusable Workflows

Modular components that avoid content duplication. Can be chained from other workflows. This is Intercom's answer to DRY principles in automation.

### Workflow Priority and Conflicts

- Simple deploy (quick Fin setup) always takes precedence over "When customer opens a new conversation" workflows
- Overlapping audiences trigger workflows in descending order
- Use unique audience settings to avoid conflicts
- Email workflows should be separate from chat workflows due to channel limitations

**Sources:**
- [Workflows explained](https://www.intercom.com/help/en/articles/7836459-workflows-explained)
- [Using branches in Workflows](https://www.intercom.com/help/en/articles/7846212-using-branches-in-workflows)
- [Conditional logic and trigger configuration](https://www.intercom.com/help/en/articles/11868426-conditional-logic-and-trigger-configuration-in-workflows)
- [Workflows best practices](https://www.intercom.com/help/en/articles/9638956-workflows-best-practices-tips-from-power-users)
- [Examples of advanced workflows](https://www.intercom.com/help/en/articles/9174590-examples-of-advanced-workflows)

---

## 4. Fin + Workflow Integration

### Bidirectional Handoff

Fin and workflows hand off in both directions:

**Workflow → Fin:** The "Let Fin answer" step inserts Fin into a workflow path. Fin takes over the conversation, answers questions using its knowledge sources, and can be configured with escalation behavior.

**Fin → Workflow:** When Fin encounters escalation triggers, the conversation exits the Fin block and follows the configured handover path — which can include branching based on which escalation rule fired.

### The "Let Fin Answer" Step

This is the core integration mechanism:
- Triggers after a customer sends a message (not before)
- Configurable settings: handover expectations, CSAT surveys, auto-close behavior
- Chat-only settings: "Set expectation for human support", "Ask for more information before handover"
- Fin takes priority over standard workflows triggered by "customer sends first message"

### Recommended Architecture

**"We don't recommend having multiple workflows per topic. We recommend you have one workflow for your inbound chat, with each conversation topic defined using branches."**

This is the single-workflow-with-branches pattern — exactly what our architecture adopts with `conversation_branches` as nodes in one implicit graph.

### Workflow Templates

Intercom provides channel-specific templates (Messenger, WhatsApp, SMS, Email, Slack, Instagram, Facebook) plus use-case templates:
- **Triage Template:** Quick-reply buttons at conversation start to route common queries directly, bypassing Fin for urgent matters
- **After-Hours Template:** Fin handles conversations outside business hours, collecting details until team availability

**Sources:**
- [Use Fin AI Agent in Workflows](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows)
- [Deploy Fin over chat](https://www.intercom.com/help/en/articles/8286630-set-up-fin-using-workflows)
- [Deploy Fin with Workflow templates](https://www.intercom.com/help/en/articles/13514464-deploy-fin-ai-agent-fast-with-workflows-templates)

---

## 5. Fin Guidance System

### What It Is

Fin Guidance is a training system for shaping AI behavior using natural language instructions. It's separate from the knowledge base — guidance tells Fin *how* to behave, not *what* to know.

### Configuration

- Maximum **100 guidance pieces** per workspace
- **2,500 characters** per guidance entry
- Five categories: Communication Style, Context and Clarification, Content and Sources, Spam, Other
- Supports **audience targeting** (different guidance for different customer segments)
- Supports **channel-specific rules** (different behavior on email vs chat)
- Can embed user data (`{First name}`, `{Company name}`) for personalization

### Limitations

- Cannot perform conversation actions (tagging, routing, attribute updates)
- Cannot modify Custom Answers
- Only one guidance applies per situation (system selects the most relevant)

### Testing

Built-in AI writing assistant reviews guidance for ambiguity, redundancy, contradictions, and clarity. Preview panel tests guidance against real or simulated scenarios before enabling.

**Source:** [Provide Fin with specific guidance](https://www.intercom.com/help/en/articles/10210126-provide-fin-ai-agent-with-specific-guidance)

---

## 6. Escalation Model

### Two-Layer System

**Escalation Rules** (data-driven):
- Triggered by structured data conditions
- Examples: Fin Attribute "Sentiment" = "Negative", conversation order total > $500, custom "VIP_customer" = true
- Deterministic — if condition matches, escalation fires

**Escalation Guidance** (natural language):
- Triggered by natural language scenarios and customer behaviors
- Examples: customer uses frustration words ("angry", "not working"), asks to speak with a human, repeatedly visits pricing/cancellation page
- Ideal when specific data attributes aren't available

### Default Escalation Behaviors

Out of the box, Fin escalates when:
- Customer explicitly asks for a human
- Strong frustration or anger detected
- Customer stuck in a repetitive loop (3 rounds of repeated messages)

Fin *offers* escalation (rather than immediately escalating) when:
- Customer asks how to contact support
- Visible frustration signals
- Ambiguous keywords like "agent" or "support"

### Dedicated Escalation Model

Intercom's /research team built a **multi-task ModernBERT encoder model** with three classifier heads:

| Head | Output | Purpose |
|---|---|---|
| Escalation classifier | 3-way (escalate/offer/continue) | Core routing decision |
| Reason classifier | 8 escalation reasons | Categorizes why |
| Guideline citation | Multi-label | Which guidance matched |

Performance: **>98% escalation accuracy**, 97.4% decision accuracy, 97% reason accuracy. 0.5-second latency reduction vs LLM baseline. Handles 90% of conversations; LLM fallback for complex/lengthy inputs.

### Post-Escalation Routing

Escalation triggers feed into the workflow system. Operators create branches based on which escalation rule fired, enabling different routing for billing complaints vs technical issues vs VIP requests.

**Sources:**
- [Manage Fin escalation guidance and rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules)
- [To escalate or not to escalate (Fin research)](https://fin.ai/research/to-escalate-or-not-to-escalate-that-is-the-question/)
- [Optimizing Fin for escalation](https://www.intercom.com/help/en/articles/12041506-optimizing-fin-ai-agent-for-customer-escalation-and-interaction)

---

## 7. Fin Procedures (Fin 3)

### What They Are

Procedures are the evolution beyond Fin Tasks — natural language SOPs with deterministic controls. They handle complex, multi-step customer interactions that require business logic.

### How They Differ from Workflows

| Aspect | Workflows | Procedures |
|---|---|---|
| Interaction style | Predefined paths with reply buttons | Natural language AI reasoning |
| Authoring | Visual canvas, drag-and-drop | Natural language instructions |
| Flexibility | Rigid paths | Non-linear step progression |
| Adaptation | No | AI adjusts when customer changes topic mid-process |

### Core Components

1. **Natural language instructions** — Write SOPs in plain language, copy-paste existing docs, or let AI draft from an outline
2. **Branching logic** — If/else conditions for decision points (e.g., refund eligibility thresholds)
3. **Code snippets** — Python code for deterministic calculations, eligibility checks, date math
4. **Data connectors** — API calls to external systems (Stripe, Shopify, Linear)
5. **Sub-procedures** — Reusable logic blocks to avoid duplication
6. **Human checkpoints** — Pause points where Fin waits for human approval before sensitive actions
7. **Wait-for-webhook** — Pause for external system responses (identity verification, payment confirmation)

### Agentic Behavior

Procedures are non-linear: "Fin reads the entire Procedure context as it talks, moving up or down steps or switching between Procedures when needed." The AI can skip irrelevant steps, revisit earlier steps, and pivot when the customer provides new information.

### Limitations

- Sequential execution only — no parallel processing
- Cannot close conversations automatically
- Custom Objects not yet supported
- Intent-triggered only (no time-based or button triggers)

### Testing (Simulations)

- AI acts as a simulated customer
- Multi-turn conversation validation
- Step-by-step reasoning visibility
- Centralized simulation library for regression testing
- AI suggests needed test cases and refinements

**Sources:**
- [Fin Procedures explained](https://www.intercom.com/help/en/articles/12495167-fin-procedures-explained)
- [What's new with Fin 3](https://www.intercom.com/blog/whats-new-with-fin-3/)
- [Procedures and Simulations updates](https://www.intercom.com/blog/procedures-simulations-updates/)

---

## 8. Fin Tasks and Data Connectors

### Fin Tasks

Fin Tasks combine multiple Data connectors (API calls) with business logic for multi-turn customer interactions.

**Trigger mechanism:** Fin uses **intent detection** for automatic activation — "automatically detects when to start a task based on customer intent." No complex setup required.

**Setup:** Title (when to activate) + description (situation details and edge cases) + positive/negative training examples + audience rules + instruction steps.

**Capabilities:**
- Verify customer identity through multiple authentication methods
- Execute real-time actions (refunds, account updates, subscription modifications)
- Wait-for-webhook for asynchronous operations
- Read and update standard, company, conversation, and temporary attributes

Note: Fin Procedures are the evolution of Fin Tasks. Tasks are simpler (single-step or basic multi-step); Procedures handle complex multi-step flows with branching.

### Data Connectors (formerly Custom Actions)

- API integrations to external systems
- 30-second timeout (vs default 15 seconds) when used with Procedures
- Automatic XML-to-JSON conversion
- Three-step integration: URL/body insertion with `{..}` syntax → attribute mapping → action input mapping

**Sources:**
- [Fin Tasks and Data connectors explained](https://www.intercom.com/help/en/articles/9569407-fin-actions-explained-beta)
- [How to set up Fin Tasks](https://www.intercom.com/help/en/articles/10257113-how-to-set-up-fin-tasks)
- [How attributes power Fin Tasks, Workflows, and Actions](https://www.intercom.com/help/en/articles/10546434-how-attributes-can-power-your-fin-tasks-workflows-and-data-connectors)

---

## 9. Conversational Experience and Resolution

### Multi-Turn Conversation

- Fin remembers conversation context — customers don't repeat themselves
- Responses are natural language (not verbatim article quotes), ~10% more concise than earlier versions
- Fin asks follow-up questions to clarify ambiguous situations
- Dynamically generated feedback prompts vary contextually

### Resolution Model

| State | Meaning |
|---|---|
| Confirmed resolution | Customer says answer was helpful |
| Assumed resolution | Customer exits without requesting further help |
| Unknown | Fin hasn't answered yet (greetings, clarifying questions only) |
| Abandoned | Customer explicitly said the answer didn't help |
| Pending | Still in progress, waiting for customer response |

### Loop Detection

After 3 rounds of repeated messages without new information, Fin offers to connect with a human agent.

### Inactivity Handling

If no customer response within 4 minutes, Fin proactively checks in to confirm assistance needs.

**Sources:**
- [Conversational Fin experience](https://www.intercom.com/help/en/articles/11433030-conversational-fin-experience)
- [Fin AI Agent resolutions](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-resolutions)

---

## 10. Cross-Reference: Validation Against Picasso Architecture

### Confirmed Correct

| Our Design | Intercom Equivalent | Status |
|---|---|---|
| Constrained classification with descriptions | Fin Attributes with value descriptions | Exact match |
| Separate classification call | Dedicated ModernBERT model for escalation; attributes detected separately from response | Validated |
| Sequential if/else branching | Workflow branches, first-match-wins | Exact match |
| Context-aware fallback | "Always set an Else path" | Validated |
| Triggers → Conditions → Actions | Same three-layer model | Exact match |
| Session position tracking | One workflow at a time per conversation | Validated |

### Gaps Identified (incorporated into architecture doc)

| Gap | Intercom Feature | Resolution |
|---|---|---|
| One active branch constraint not explicit | "One customer-facing workflow at a time" | Added to architecture doc |
| AND logic framing slightly wrong | Intercom allows multiple ANDs per branch | Corrected framing in doc |
| Escalation was vague future item | Two-layer escalation with dedicated model | Elevated to defined pattern |
| Classify every message | Fin detects at key moments only | Added skip-classification heuristic note |
| No Procedures equivalent | AI-driven SOPs with deterministic controls | Added as future direction |

### Not Applicable to Picasso (current scale)

| Intercom Feature | Why Not Applicable |
|---|---|
| Multi-channel deployment templates | Picasso is chat-only widget |
| Fin Voice (phone) | Not in scope |
| Ticket operations | Picasso doesn't have ticketing |
| Custom Objects | No CRM integration |
| Simulation library | Could be valuable later but requires AI-as-customer infrastructure |
| Reusable workflows | Relevant when branch count exceeds ~20 |
