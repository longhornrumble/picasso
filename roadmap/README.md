# Picasso Widget Roadmap

This folder contains product requirements documents (PRDs) and technical proposals for the evolution of the Picasso chat widget.

## Priority Features

1. **[Lex Integration](./feature-lex-integration.md)** - Connect to AWS Lex for conversational AI
   - Status: Next Up
   - Priority: P0 (Core Functionality)
   - Effort: 3-5 days

## Current PRDs

1. **[Instant Loading System](./prd-instant-loading.md)** - Simplify theming architecture for better maintainability
   - Status: Proposed
   - Impact: High (Technical Debt Reduction)
   - Effort: 2.5 hours

2. **[Self-Scheduling System](./prd-self-scheduling.md)** - AI-powered interview scheduling
   - Status: Future
   - Impact: Very High (Killer Feature)
   - Effort: 7-11 days (3-5 for MVP)

## Completed Features

- ✅ Iframe-based architecture for CSS isolation
- ✅ Multi-tenant support
- ✅ Staging deployment pipeline
- ✅ Foster Village branding implementation

## Architecture Proposals

- [Simplification Proposal](../SIMPLIFICATION_PROPOSAL.md) - Broader architectural improvements

## Contributing

When adding new PRDs:
1. Create a new file: `prd-[feature-name].md`
2. Update this README with status
3. Include realistic timelines
4. Focus on solving real problems, not adding complexity