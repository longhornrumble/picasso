# Picasso Config Builder

Web-based configuration tool for managing conversational forms, CTAs, and conversation branches for the Picasso chat widget.

## Overview

The Picasso Config Builder is an internal operations tool that allows non-technical team members to configure forms-enabled tenants without manual JSON editing.

### Key Features
- **Forms Management**: Create and edit conversational forms with field builders
- **CTA Configuration**: Define call-to-action buttons with conditional prompts
- **Branch Editor**: Configure conversation flow with priority-based branching
- **Program Management**: Manage programs and their relationships
- **Validation**: Real-time validation with dependency checking
- **S3 Deployment**: Direct deployment to tenant configuration storage

## Architecture

### System Flow
1. Load base tenant config from S3 (created by `deploy_tenant_stack` Lambda)
2. Edit forms, CTAs, conversation branches, and card inventory
3. Validate configuration against schema v1.3
4. Deploy merged config back to S3
5. Picasso widget consumes updated config

### Related Systems
- **Picasso Widget**: Consumes configs from S3
- **deploy_tenant_stack**: Creates base tenant configs
- **Bubble.io**: Handles notification/integration routing (separate from forms)

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **UI**: shadcn/ui components
- **State**: Zustand
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS (green theme matching analytics dashboard)
- **Backend**: AWS Lambda (Node.js 20.x) + API Gateway
- **Storage**: S3 (`myrecruiter-picasso` bucket)

## Project Structure

```
picasso-config-builder/
├── src/
│   ├── components/
│   │   ├── BranchEditor/
│   │   ├── CTAEditor/
│   │   ├── FormEditor/
│   │   └── shared/
│   ├── hooks/
│   ├── lib/
│   │   ├── schemas/
│   │   ├── validation/
│   │   └── s3/
│   ├── types/
│   └── App.tsx
├── docs/
│   ├── TENANT_CONFIG_SCHEMA.md
│   ├── WEB_CONFIG_BUILDER_PRD.md
│   ├── WEB_CONFIG_BUILDER_PROJECT_PLAN.md
│   └── wireframes/
├── lambda/
│   ├── config-api/
│   └── deploy/
└── tests/
```

## Getting Started

### Prerequisites
- Node.js 20.x or higher
- AWS CLI configured with appropriate credentials
- Access to `myrecruiter-picasso` S3 bucket

### Installation

```bash
# Clone the repository
git clone https://github.com/longhornrumble/picasso-config-builder.git
cd picasso-config-builder

# Install dependencies
npm install

# Start development server
npm run dev
```

### Configuration

Create a `.env.local` file:

```env
VITE_S3_BUCKET=myrecruiter-picasso
VITE_API_URL=https://api.example.com
VITE_AWS_REGION=us-east-1
```

## Development Roadmap

### MVP (Phase 1) - 2 weeks
- [x] PRD and schema documentation
- [x] Wireframe designs
- [ ] Project scaffolding
- [ ] Branch Editor component
- [ ] CTA Editor component
- [ ] Form Editor component
- [ ] Validation engine
- [ ] S3 integration
- [ ] Deployment

### Templates (Phase 2) - 1 week
- [ ] Pre-built form templates
- [ ] Template customization
- [ ] Template library

### Visual Builder (Phase 3) - 2 weeks
- [ ] Drag-and-drop form builder
- [ ] Live preview
- [ ] Visual CTA linking
- [ ] Validation dashboard

## Documentation

- [Product Requirements](docs/WEB_CONFIG_BUILDER_PRD.md)
- [Project Plan](docs/WEB_CONFIG_BUILDER_PROJECT_PLAN.md)
- [Config Schema v1.3](docs/TENANT_CONFIG_SCHEMA.md)
- [Wireframes](docs/wireframes/)

## Authentication

**MVP**: No authentication (single-user internal tool)
**Future**: Simple password protection or AWS Cognito

## Deployment

### Frontend
Deploy to S3 + CloudFront for private internal access

### Backend (Lambda)
- `config-api`: Read/write operations for S3 configs
- Package and deploy via AWS SAM or CDK

## Contributing

This is an internal operations tool. For questions or issues:
1. Check the documentation in `/docs`
2. Review wireframes for UX guidance
3. Validate against config schema v1.3

## License

Proprietary - Internal use only

## Support

For support or questions, contact the development team.

---

**Status**: Initial setup in progress
**Version**: 0.1.0
**Last Updated**: 2025-10-15
