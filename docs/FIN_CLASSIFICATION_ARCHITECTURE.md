# Fin Classification Architecture: How Intercom Separates Classification from Response Generation

**Date:** 2026-02-26
**Scope:** Constrained intent classification only — how Fin detects conversation attributes and how workflow rules consume them. Not a Picasso implementation plan.

---

## The Three-Layer Separation

Fin does not ask the AI to pick actions. Fin separates three concerns into three independent layers:

| Layer | Owner | Input | Output |
|---|---|---|---|
| **Response generation** | LLM (RAG pipeline) | Customer message + knowledge base | Natural language answer |
| **Classification** | Separate AI evaluation | Customer message + attribute definitions | Attribute label from closed list |
| **Routing** | Deterministic rules (workflow engine) | Classified attribute + other signals | Branch path / action |

The LLM that generates the response never sees the attribute taxonomy. The classifier that labels the conversation never generates a response. The routing engine that maps labels to actions has no AI — it evaluates if/else rules. Each layer has one job.

---

## Layer 1: Response Generation

Fin's AI Engine processes queries through three sequential phases:

1. **Refine** — Filters unsafe content, optimizes the query for searchability, checks for triggerable Workflow automations and pre-configured Custom Answers before passing to RAG
2. **Generate** — Bespoke RAG architecture searches three information sources (content, data, integrations), augments the optimized query with retrieved information, then generates a response
3. **Validate** — Validates the response against the original query, checks confidence levels and whether the answer is grounded in knowledge resources

Classification is not part of this pipeline. The response generator does not know that attributes exist. It has one job: answer the customer's question using knowledge base content.

The Refine phase (Phase 1) is noteworthy: Fin pre-processes the query before generating a response. It checks whether existing automations or Custom Answers should handle the query, and optimizes "in terms of its meaning and context" before RAG retrieval. This is a pre-processing intelligence layer that operates before the main LLM call.

Fin also supports **Guidance** — natural language behavioral rules that shape HOW Fin responds (tone, follow-up behavior, source prioritization). "The system checks guidance before generating responses." Guidance is a pre-generation input to Layer 1. It cannot perform conversation actions, modify routing, or interact with the classification system. It is purely a behavioral shaping layer for response generation — confirming that response shaping and classification are architecturally separate concerns.

**Sources:**
- [The Fin AI Engine](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine)
- [Provide Fin with specific guidance](https://www.intercom.com/help/en/articles/10210126-provide-fin-ai-agent-with-specific-guidance)

---

## Layer 2: Classification

All Fin classification follows the same pattern: **humans write descriptions, AI classifies against them.** The difference across Fin's systems (Attributes, Tasks) is the richness of inputs available to the classifier. The underlying operation is the same: match a user's message against a described set of options.

### What the Operator Defines

The operator creates a classifiable category with:

- **Name** — A clear, distinct label (e.g., "Billing", "Mentoring")
- **Description** — Natural language explanation of what this category means and when it applies. This is the primary accuracy input.
- **Negative cases** (in description text) — What this category is NOT. Operators can "call out situations where Fin should not use this task" directly in the description.
- **Training examples** (optional, richer accuracy) — Real customer messages that should match (positive) and messages that look similar but should NOT match (negative).

Example (described taxonomy):

| Attribute: "Issue type" | Description |
|---|---|
| Billing | Customer has questions about charges, invoices, or payment methods |
| Projects | Customer needs help with project setup, configuration, or collaboration |
| Account Management | Customer wants to update account settings, change plan, or manage team members |

Fin uses "the attribute name, its description, and the value names and descriptions when evaluating which attribute value to apply." Operators are instructed to ensure all fields are "written in a human-readable way that is easy for Fin to interpret."

**Bare labels without descriptions produce poor classification.** This is by design — descriptions give operators a tuning lever that doesn't require prompt engineering. When classification isn't accurate, the primary remedy is checking naming and descriptions.

### Training Examples: Positive and Negative

For intent-triggered tasks, Fin adds two inputs beyond descriptions:

**Positive examples ("Trigger when..."):** Operators select real customer messages from their inbox that should match this intent. "The more relevant examples you provide, the better Fin will understand your task's purpose."

**Negative examples ("Don't trigger when..."):** Operators select messages that "might seem related but should NOT trigger this task. This is especially helpful for refining the trigger and addressing misfires."

This three-input design (description + positive examples + negative examples) means classification accuracy can be tuned from three directions. Negative examples are explicitly the mechanism for fixing misclassification — the operator provides the boundary cases that the description alone couldn't distinguish.

### What the AI Classifies

The classifier evaluates the **customer's message and conversation context** against the described values. It picks from the closed list. It cannot invent new labels.

The classifier does NOT see:
- The AI's own response (classification is independent of response generation)
- The routing rules (the classifier doesn't know what will happen when it picks a label)
- Action menus, CTA lists, or button configurations

**Null handling:** If no value fits, Fin returns null — no attribute is assigned. Intercom recommends including an "Other" option for attributes where the taxonomy may not cover all cases, particularly "wide or evolving" attributes.

### When Classification Happens

Attributes are **not detected on every message**. Fin's default behavior assigns attributes when its job is complete:
- When handing off to a teammate
- When the customer expresses resolution (positive feedback)
- When a customer becomes inactive

This is both a cost and accuracy optimization. Classifying every message wastes compute on follow-ups ("thanks", "tell me more") where the attribute hasn't changed. It also introduces reclassification risk — a user mid-conversation about billing who asks "what are your hours?" doesn't need their attribute overwritten.

Two exceptions to this timing:

1. **Escalation rules:** When attributes are used in escalation rules, Fin re-evaluates dynamically, reacting "immediately to changes in customer intent or sentiment that might require escalation."
2. **Detect on close:** An optional setting allowing Fin to update classification when conversations close.

### Silent Classification (No Customer-Facing Response Required)

Operators can detect attributes without sending a customer-facing reply. A "Let Fin answer" block paired with immediate routing rules allows Fin to identify attributes, then exit before sending messages. Subsequent workflow steps route the conversation using the applied attributes.

This confirms that classification is architecturally independent from response generation — you can run classification without generating a response at all.

**Critical constraint:** "Fin can only detect and assign attributes when engaged in an active conversation." A "Let Fin answer" (or "Let Fin handle") workflow step must be present. "Fin Attributes cannot be detected independently of Fin being invoked in the conversation." Classification requires Fin to be active, but does not require Fin to send a response.

### Conditional (Hierarchical) Attributes

Fin supports parent/dependent attribute relationships for progressive classification:

- A **controlling attribute** (parent) triggers dependent attributes to appear
- Example: When "Issue" = "Delivery," the "Delivery Carrier" attribute becomes visible to Fin for detection
- The controlling attribute must be a list data type
- Changing the parent automatically removes dependent attribute values — ensures data consistency
- Limited to 100 conditions per dependent attribute
- Cannot use AND logic for conditional visibility (e.g., cannot require "Category = Product AND Price > $100")
- Fin only attempts to detect dependent attributes after identifying specific parent attribute values

Two capabilities within conditional attributes:

1. **Conditional visibility:** Show/hide dependent attributes based on parent values
2. **Conditional option limiting:** Restrict which dropdown options display based on parent selection (e.g., show only EMEA countries when "Region" = "EMEA")

This keeps each classification focused on a small, relevant set of options rather than presenting the full taxonomy every time. At scale (15-20+ values), a flat list becomes unwieldy. Hierarchical classification maintains precision by narrowing the option set progressively.

### Accuracy Tuning and Monitoring

Fin provides an AI writing assistant that reviews descriptions for ambiguity, redundancy, contradictions, and clarity. A preview tool tests classification against example customer messages before enabling in production.

Post-deployment, Fin provides real-time statistics per attribute value:
- **Conversations** — number detected for each value
- **Resolved** — percentage fully resolved
- **Routed** — percentage successfully routed using that attribute

Operators can drill into individual conversations to review classification reasoning. Teammates can manually override incorrect classifications. This creates a closed feedback loop: author descriptions → deploy → monitor stats → review individual decisions → refine descriptions → redeploy. The operator tunes accuracy entirely through description quality — they never touch the classification logic.

**Scale limit:** Maximum 250 values per attribute. Designed for finite, human-manageable taxonomies — not open-ended classification.

**Sources:**
- [How to create Fin Attributes](https://www.intercom.com/help/en/articles/11680403-how-to-create-fin-attributes)
- [Using Fin Attributes in workflows, reports, and the inbox](https://www.intercom.com/help/en/articles/12397045-using-fin-attributes-in-workflows-reports-and-the-inbox)
- [Conditional conversation attributes](https://fin.ai/help/en/articles/11646220-how-to-use-conditional-conversation-attributes)
- [How to set up Fin Tasks](https://www.intercom.com/help/en/articles/10257113-how-to-set-up-fin-tasks)
- [How attributes power Fin Tasks, Workflows, and Actions](https://www.intercom.com/help/en/articles/10546434-how-attributes-can-power-your-fin-tasks-workflows-and-data-connectors)

---

## Layer 3: Routing (Workflow Rules)

### How Attributes Are Consumed

After classification, attributes power deterministic workflow branching. The routing layer is pure rules — no AI.

Branch evaluation:
- **Sequential if/else** — each branch checks one condition
- **First match wins** — no other path fires
- **Always has an "Else" branch** — catches everything that didn't match
- **Operators:** `IS`, `IS NOT`, `CONTAINS` (case-insensitive)

Conditions can combine multiple signals with AND logic within a single branch (e.g., "Topic IS Billing AND Plan IS Enterprise"), but the structure stays flat — no nested OR-of-ANDs.

### What Signals Are Available to Conditions

Routing conditions can use:
- **Fin Attributes** (AI-classified: topic, issue type, sentiment, urgency)
- **Person data** (name, email, plan, custom fields)
- **Company data** (industry, size, account tier)
- **Conversation data** (channel, page URL, first message time)
- **Capacity** (team availability)

Attributes are one input among many. The routing engine combines AI classification with structured data the AI never sees.

### One Workflow at a Time

"Only one workflow with customer-facing content can be running at any point." If conversation conditions change, another workflow can jump in. The previous workflow does not stack — it is replaced. Background workflows (non-customer-facing) can run in parallel.

**Sources:**
- [Workflows explained](https://www.intercom.com/help/en/articles/7836459-workflows-explained)
- [Using branches in Workflows](https://www.intercom.com/help/en/articles/7846212-using-branches-in-workflows)
- [Use Fin AI Agent in Workflows](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows)

---

## Summary: The Classification Contract

The Fin classification system follows a strict contract:

1. **Humans define the taxonomy.** Every classifiable category has a name and a natural language description. The AI never invents categories.

2. **Classification evaluates the customer, not the AI.** The input to the classifier is the customer's message and conversation context. The AI's generated response is not an input to classification.

3. **Classification is independent from response generation.** They can run in any order, in parallel, or one without the other. Classification can happen silently without generating a customer-facing response.

4. **Classification output is a label, not an action.** The classifier returns which category matched (or null if none). It does not know what will happen with that label. Routing rules — authored by humans, evaluated deterministically — decide the action.

5. **Descriptions drive accuracy.** The quality of classification is directly proportional to the quality of the human-written descriptions. Poorly described categories produce poor classification. This is by design — it gives operators a tuning lever that doesn't require prompt engineering.

6. **Negative examples refine boundaries.** Operators provide both positive examples (real customer messages that should match) and negative examples (similar messages that should NOT match). The description itself can call out situations where the intent should not apply. This is the primary mechanism for fixing misclassification.

7. **Hierarchical classification narrows the option set.** When the taxonomy grows beyond a manageable flat list, parent/dependent attribute relationships progressively narrow what the classifier evaluates, maintaining precision at scale.
