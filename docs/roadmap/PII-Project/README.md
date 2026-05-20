# MyRecruiter / Picasso PII Governance Strategy and Advisory Agent Guide

## Purpose

This document is a starter strategy brief for planning how MyRecruiter/Picasso handles personally identifiable information, personal data, sensitive-adjacent data, consent, retention, tenant isolation, and AI governance.

It is intended to be copied into Claude or Claude Code to begin a planning discussion and to guide the creation of advisory subagents.

This is not legal advice. The goal is to identify risks early, recommend safer architecture and product choices, and produce clear questions for qualified counsel before production decisions are finalized.

---

## Product Context

MyRecruiter is a for-profit SaaS platform serving nonprofit organizations.

Picasso is an AI chat application embedded on nonprofit websites and possibly other channels. Today, it is primarily used to:

- answer questions from nonprofit website visitors;
- guide potential volunteers;
- answer donor/supporter questions;
- direct visitors to forms, donation pages, program pages, staff contacts, and other next steps;
- collect contact information or form submissions when a visitor intentionally provides them;
- provide analytics and insight to nonprofit clients.

Important boundary:

MyRecruiter/Picasso does **not currently recruit employees**. It does not currently screen job applicants, rank candidates, make hiring decisions, conduct interview scoring, or evaluate paid employment eligibility.

That matters because the current compliance posture should be centered around volunteer, donor, supporter, visitor, nonprofit, consumer privacy, communications consent, AI governance, tenant isolation, and nonprofit fundraising/volunteer claims â not employment recruiting law.

However, if MyRecruiter later expands into employee recruiting, applicant screening, resume processing, background-check decisions, or AI-assisted employment recommendations, a dedicated employment-law/AI-hiring compliance review should happen before development continues.

---

## Strategic Framing

Treat this as a **PII architecture project**, not a paperwork project.

The first goal is not to write a privacy policy. The first goal is to understand and control the data lifecycle:

> What personal data do we collect, where does it go, why do we need it, who can access it, how long do we keep it, and can we find, export, delete, or anonymize it later?

Good privacy planning should shape:

- product design;
- data models;
- logging behavior;
- prompt behavior;
- analytics architecture;
- consent capture;
- retention rules;
- tenant isolation;
- vendor integrations;
- security controls;
- privacy policy accuracy;
- future readiness for California and other privacy regimes.

The biggest early risk is not missing an obscure privacy rule. The biggest early risk is letting PII quietly spread through logs, transcripts, analytics, Bubble, n8n, Sheets, CRMs, email tools, SMS tools, LLM requests, and tenant workflows without a clear map.

---

## Core Design Principle

### Treat chat transcripts as PII by default

Even if a visitor is anonymous, a chat transcript may include:

- name;
- email;
- phone number;
- address;
- child or family details;
- foster-care information;
- health or disability information;
- financial hardship;
- abuse/crisis details;
- immigration or legal issues;
- donor intent;
- volunteer intent;
- program eligibility information;
- location information;
- background-check-related information.

Therefore, raw transcripts should be treated as sensitive operational records, not harmless analytics.

Default posture:

- do not log full transcripts in CloudWatch by default;
- do not retain transcripts forever by default;
- do not expose transcripts across tenants;
- do not send full transcripts to staff unless there is a specific workflow reason;
- do not use transcripts for model training without explicit policy, consent, and legal review;
- separate raw transcripts from structured analytics where possible;
- use redacted summaries or event labels where possible;
- define retention before storage.

---

## First Planning Deliverables

Create these documents before implementing broad PII-related features.

### 1. `docs/governance/pii-project-charter.md`

Purpose: establish the scope, design principles, and boundaries of the PII project.

Suggested content:

```md
# PII Project Charter

## Goal
Design MyRecruiter/Picasso so personal information is collected intentionally, stored minimally, protected by default, separated by tenant, retained only as long as needed, and easy to disclose, export, delete, or anonymize later.

## Current Product Scope
- Nonprofit website chatbot
- Volunteer interest capture
- Donor/supporter Q&A
- Contact forms
- Chat transcripts
- Analytics
- Client admin configuration
- Integrations to Bubble, n8n, email/SMS, Sheets, CRM, or nonprofit systems

## Out of Scope For Now
- Employee recruiting
- Resume screening
- Hiring decisions
- Background-check evaluation
- GDPR implementation
- HIPAA-regulated workflows
- Payment processing storage

## Design Principles
- Collect less.
- Store less.
- Log less.
- Separate tenants.
- Define retention before storage.
- Treat chat transcripts as PII by default.
- Do not let AI make eligibility, approval, safety, tax, legal, or placement decisions.
```

### 2. `docs/governance/pii-inventory.md`

Purpose: identify the data elements MyRecruiter collects, generates, stores, transmits, or exposes.

Suggested table:

```md
# PII Inventory

| Data Element | Example | Data Subject | Source | Purpose | Required? | Sensitivity | Stored Where | Sent To | Retention | Deletion Method | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Name | Jane Smith | Volunteer prospect | Chat form | Staff follow-up | Yes/No | Moderate | Bubble | Tenant staff email | TBD | TBD | |
| Email | jane@email.com | Donor prospect | Form | Send follow-up | Yes/No | Moderate | Bubble / SendGrid | Tenant staff | TBD | TBD | |
| Phone | 512-555-0000 | Volunteer prospect | SMS opt-in | Text follow-up | Optional | High | Bubble / Twilio | Tenant staff | TBD | TBD | SMS consent needed |
| Chat transcript | User-provided chat text | Website visitor | Chat | Support/Q&A/analytics | Operational | High | TBD | TBD | TBD | TBD | Treat as PII |
| IP address | 1.2.3.4 | Website visitor | Widget/API | Security/session | Maybe | Moderate | Logs | AWS | TBD | TBD | Avoid if not needed |
| UTM source | newsletter | Visitor/session | URL | Attribution | Optional | Low/Moderate | Analytics | Dashboard | TBD | TBD | Linkability matters |
| AI summary | Interested in volunteering | Volunteer prospect | AI-generated | Routing/analytics | Optional | Moderate/High | Analytics | Tenant dashboard | TBD | TBD | Inference may be personal data |
```

### 3. `docs/governance/data-flow-map.md`

Purpose: describe how PII enters, moves through, and exits the system.

Start with plain English. Diagram later.

Suggested sections:

```md
# Picasso Data Flow Map

## Visitor Chat Flow
1. Visitor opens chatbot on tenant website.
2. Widget loads tenant configuration.
3. Visitor sends message.
4. Message goes to MyRecruiter API/Lambda.
5. Lambda sends request to LLM/RAG system.
6. Response returns to visitor.
7. Conversation event may be stored for analytics.
8. Transcript may or may not be stored depending on tenant/config.
9. High-intent event may trigger form, notification, or integration.

## Form Submission Flow
1. Visitor submits name/email/phone/message.
2. Form payload goes to Lambda/API.
3. Payload is validated and tagged with tenant context.
4. Payload is sent to Bubble and/or n8n.
5. Notification is sent to nonprofit staff.
6. Optional integration sends data to Google Sheets, CRM, or email platform.
7. Consent record is stored if email/SMS follow-up is requested.

## Admin/Tenant Config Flow
1. MyRecruiter admin configures tenant.
2. Tenant config is stored.
3. Widget retrieves public-safe config.
4. Secrets/private routing rules remain server-side.
```

### 4. `docs/governance/data-classification.md`

Purpose: create a simple handling tier system for data.

Suggested tiers:

```md
# Data Classification

## Tier 0 â Public
Examples:
- Public nonprofit website content
- Public program descriptions
- Public donation links

Controls:
- Can be used in RAG
- Can be cached
- Can appear in chatbot responses

## Tier 1 â Operational Non-Sensitive
Examples:
- Tenant name
- Public branding config
- Public website URL
- Public contact page URL

Controls:
- Tenant-isolated
- Safe for limited frontend exposure if intended

## Tier 2 â Personal Information
Examples:
- Name
- Email
- Phone
- Address
- IP address
- Session ID
- Volunteer interest
- Donor interest

Controls:
- Tenant-isolated
- Access controlled
- No unnecessary logging
- Retention defined
- Deletion/export possible

## Tier 3 â Sensitive or Sensitive-Adjacent
Examples:
- Full chat transcripts
- Child/minor information
- Foster care/family status
- Health/disability information
- Financial hardship
- Abuse/crisis disclosures
- Background-check-related information
- Precise location
- AI-generated summaries about sensitive topics

Controls:
- Avoid collection where possible
- Redact logs
- Restrict access
- Shorter retention
- Human handoff rules
- Counsel review before expanding use

## Tier 4 â Secrets / Security-Critical
Examples:
- API keys
- JWT secrets
- AWS credentials
- webhook secrets
- tenant private routing rules
- integration tokens

Controls:
- Never expose client-side
- Secrets manager/env only
- Least privilege
- Rotation process
- No logs
```

### 5. `docs/governance/privacy-risk-register.md`

Purpose: turn unknowns into visible, managed risks.

Suggested starter register:

```md
# Privacy Risk Register

| Risk | Scenario | Impact | Likelihood | Current Control | Needed Control | Owner | Status |
|---|---|---:|---:|---|---|---|---|
| Raw transcripts contain sensitive data | Visitor shares foster/child/family/crisis info | High | High | TBD | Transcript retention + redaction + access limits | TBD | Open |
| PII appears in CloudWatch logs | Lambda logs request payloads | High | Medium | TBD | Log sanitizer | Engineering | Open |
| Cross-tenant exposure | Tenant sees another tenantâs chats/forms/config | Critical | Low/Med | Tenant ID/hash logic | Automated tests + access checks | Engineering | Open |
| Consent not provable | User submits phone number but SMS consent text not stored | High | Medium | TBD | Consent event table | Product/Eng | Open |
| Privacy policy mismatch | Policy says one thing, product does another | High | Medium | TBD | Data inventory drives policy | Ops/Legal | Open |
| Third-party sprawl | n8n/Sheets/CRM receive PII without inventory | Medium/High | High | TBD | Integration registry | Product/Eng | Open |
| AI makes eligibility-like recommendation | Bot says user qualifies/does not qualify | High | Medium | Prompt only | Hard handoff rules + tests | AI/Eng | Open |
```

---

## Second-Wave Governance Deliverables

After the first five documents exist, create:

1. `docs/governance/default-retention-policy.md`
2. `docs/governance/consent-and-communications-model.md`
3. `docs/governance/vendor-subprocessor-inventory.md`
4. `docs/governance/user-rights-readiness-plan.md`
5. `docs/governance/ai-governance-boundaries.md`
6. `docs/governance/tenant-isolation-control-plan.md`
7. `docs/governance/logging-redaction-standard.md`
8. `docs/governance/privacy-policy-source-of-truth.md`

---

## Default PII Storage Rules

Use these as starting defaults until a stronger policy is written.

### Raw Chat Transcripts

Default: do not store forever.

Use only for:

- debugging;
- support;
- quality review;
- tenant analytics if intentionally enabled;
- investigation of abuse, safety, or operational issues.

Recommended controls:

- define retention, such as 30â90 days by default;
- never log full raw transcripts in CloudWatch by default;
- tenant access only if deliberately productized;
- MyRecruiter admin access should be restricted;
- transcript export/deletion should be feasible;
- avoid training models on transcripts without explicit review.

### Chat Analytics

Default: store structured events instead of raw transcript content where possible.

Examples:

- topic;
- intent;
- timestamp;
- tenant;
- conversion event;
- handoff requested;
- form started/completed;
- after-hours flag;
- user clicked donation link;
- user clicked volunteer link.

Longer retention may be reasonable if the events are not directly identifiable or are appropriately minimized.

### Forms

Default: store intentional form submissions.

Controls:

- tenant-isolated;
- accessible to authorized tenant staff/admin;
- findable by email/phone/name for deletion/export;
- retention configurable by tenant or product tier;
- avoid collecting sensitive fields unless needed.

### Consent Events

Default: store consent events longer than ordinary contact records if needed to prove consent.

Potential fields:

- tenant;
- form/workflow ID;
- channel: email, SMS, phone, newsletter, donor follow-up, volunteer follow-up;
- user identifier;
- consent text shown;
- timestamp;
- source URL or form;
- IP/session if justified;
- opt-in purpose;
- opt-out status;
- consent version.

### Logs

Default: operational metadata only.

Avoid logging:

- full transcripts;
- phone numbers;
- email addresses;
- addresses;
- sensitive form text;
- secrets;
- tokens;
- API keys;
- tenant-private routing rules;
- webhook payloads containing PII.

---

## Privacy Readiness Targets

### Immediate

- FTC-style reasonable data security posture;
- California privacy readiness;
- accurate website privacy policy language;
- email/SMS consent capture;
- data minimization;
- tenant isolation;
- breach-risk reduction;
- logging redaction;
- retention strategy.

### Near-Term

- U.S. state privacy law extensibility;
- access/deletion/export workflow;
- sensitive data handling;
- vendor/subprocessor inventory;
- AI governance documentation;
- consent record system;
- admin access controls.

### Later

- GDPR;
- employment recruiting compliance;
- background-check/FCRA workflows;
- HIPAA analysis if the product enters covered healthcare workflows;
- formal data processing agreements;
- formal incident response plan;
- external security/privacy audit.

---

## Advisory Agent Model

The compliance/governance agents in this project are advisory agents.

They do not:

- make final legal determinations;
- provide legal advice;
- replace legal counsel;
- block development by default;
- declare the product legally compliant or noncompliant.

They do:

- identify privacy, consent, AI governance, nonprofit, donor, volunteer, communications, and consumer-protection risks;
- recommend safer technical, product, UX, and documentation patterns;
- suggest data minimization and logging controls;
- flag issues that may require attorney review;
- help technical agents convert risk findings into implementable work;
- produce audit-friendly notes for future review.

Advisory agents should be invoked early in planning, not only after code is written.

---

## Recommended Agents

Create these files under `.claude/agents/`:

1. `pii-data-lifecycle-advisor.md`
2. `privacy-data-governance-advisor.md`
3. `nonprofit-volunteer-donor-risk-advisor.md`
4. `communications-consent-advisor.md`
5. `ai-governance-advisor.md`
6. `compliance-implementation-advisor.md`

The PII Data Lifecycle Advisor should be the first reviewer when a feature touches personal data.

---

## Agent Routing Policy

Add this to `CLAUDE.md` or keep it in this strategy document.

```md
# Compliance and Governance Advisory Model

Compliance-related agents in this project serve an advisory role during planning, architecture, implementation, and code review.

They do not:
- make final legal determinations
- provide legal advice
- block development by default
- replace qualified legal counsel
- determine whether MyRecruiter is legally compliant

They do:
- identify privacy, consent, AI governance, nonprofit, donor, volunteer, communications, and consumer-protection risks
- recommend safer technical, product, UX, and documentation patterns
- suggest data minimization and logging controls
- flag issues that may require attorney review
- help technical agents convert risk findings into implementable work
- produce audit-friendly notes for future review

Compliance advisors should be invoked early in planning, not only after code is written.
```

```md
# PII Review Triggers

Before production, require PII/Data Lifecycle advisory review for any feature that:
- collects name, email, phone, address, IP, session ID, or chat transcript content
- stores or displays form submissions
- sends data to Bubble, n8n, Sheets, CRM, email, SMS, analytics, or another third party
- changes logging behavior
- changes tenant identity, tenant hash, config lookup, or access control
- stores raw transcripts
- generates AI summaries, labels, scores, or classifications about a person
- sends email or SMS follow-up
- introduces user deletion/export/access workflows
- touches minors, foster care, families, health, disability, legal, financial, crisis, or background-check-related information
```

```md
# Agent Routing

PII data flow unclear?
â pii-data-lifecycle-advisor

Privacy notice, California readiness, retention, deletion, or vendor implications?
â privacy-data-governance-advisor

Donation, volunteer, nonprofit program, tax, or supporter-facing claims?
â nonprofit-volunteer-donor-risk-advisor

Email, SMS, newsletter, reminders, donor nurture, volunteer nurture, or follow-up?
â communications-consent-advisor

AI prompt, RAG answer, summarization, classification, routing, scoring, or handoff?
â ai-governance-advisor

Need to convert findings into actual code/tests/schema changes?
â compliance-implementation-advisor
```

---

## Employment / Hiring Compliance Trigger

Add this guardrail now, even though it is out of scope.

```md
# Employment / Hiring Compliance Trigger

MyRecruiter/Picasso does not currently recruit employees. The current compliance scope is nonprofit volunteers, donors, supporters, and website visitors.

If any feature begins to:
- collect employee applicant data,
- screen or rank job candidates,
- recommend hiring decisions,
- process resumes,
- evaluate employment eligibility,
- conduct interview scoring,
- integrate with ATS systems for paid roles,
- or use AI for employment-related decisions,

Claude must stop and recommend creation of a dedicated Employment, FCRA, EEOC, and AI Hiring Compliance Advisor before implementation continues.
```

Also apply a similar caution to volunteer background checks:

```md
# Background Check Caution

Picasso should not evaluate background-check results, recommend acceptance/rejection, summarize consumer reports, or make placement recommendations based on background-check data unless qualified counsel has reviewed the workflow.
```

---

## How To Use This With Claude Code

Suggested prompt to Claude Code:

```txt
We are starting a PII governance and privacy architecture project for MyRecruiter/Picasso.

Read this strategy document first. Then help me create the first governance deliverables:

1. docs/governance/pii-project-charter.md
2. docs/governance/pii-inventory.md
3. docs/governance/data-flow-map.md
4. docs/governance/data-classification.md
5. docs/governance/privacy-risk-register.md

Do not make legal conclusions. Treat this as advisory planning. Identify risks, design principles, open questions, technical controls, and issues that should be escalated to qualified counsel.

Use the advisory agents in .claude/agents/ where appropriate.
```

---

## Practical Sequence

1. Create the agent files.
2. Add the routing policy to `CLAUDE.md`.
3. Create the five starter governance docs.
4. Ask Claude Code to inspect the current architecture/code and draft the PII inventory.
5. Ask Claude Code to produce a first-pass data-flow map.
6. Ask the PII Data Lifecycle Advisor to review the inventory and data flow.
7. Ask the Privacy Data Governance Advisor to flag policy, retention, vendor, deletion, and California-readiness gaps.
8. Ask the Compliance Implementation Advisor to convert findings into issues, tests, schema changes, logging changes, and config changes.
9. Keep the privacy-risk register updated as decisions are made.

---

## Blunt Guidance

Do not let this become a compliance research rabbit hole.

The first useful milestone is simple:

> Know every place PII enters, moves, gets stored, gets logged, gets shared, and gets deleted.

Once that is known, privacy policy language, California readiness, vendor reviews, consent flows, retention rules, deletion workflows, and technical controls become much easier.
