# Research Workbench

An evidence-grounded multi-model deliberation workbench. Enter research ideas and let multiple AI models collaboratively research, critique, revise, and finalize through structured deliberation with evidence-grounded claims.

![CI](https://img.shields.io/badge/CI-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-703%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## What It Does

Research Workbench orchestrates multiple AI models through an 8-stage deliberation pipeline:

1. **Claim Extraction** — Extract key claims from your research idea
2. **Evidence Assessment** — Gather and evaluate supporting evidence
3. **Independent Review** — Each model reviews claims independently
4. **Cross-Critique** — Models critique each other's assessments
5. **Critique Response** — Authors respond to critiques
6. **Idea Revision** — Revise claims based on feedback
7. **Consensus Vote** — Models vote on final positions
8. **Decision Record** — Generate structured decision documentation

## Features

### Core Deliberation
- Multi-model orchestration with configurable providers (OpenRouter, Ollama, OpenAI-compatible)
- 8-stage pipeline with quality gates and adaptive iteration
- Real-time SSE event streaming for live progress monitoring
- Claim dependency graph visualization

### Document Management
- Full LaTeX editor with live preview and compilation
- Real-time collaborative editing via WebSocket
- Version history with diff comparison
- Threaded comments with position anchoring

### Evidence & Research
- Evidence assessment with reliability and staleness scoring
- Semantic search across projects (optional pgvector)
- Automated literature reviews
- BibTeX/RIS reference import and export

### Analytics & Export
- Cohort analysis and trend detection
- Claim outcome predictions
- Research recommendations
- CSV, BibTeX, Markdown, and JSON export

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- pnpm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/mberkanbicer/research-workbench.git
cd research-workbench

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Start everything (database, Redis, API, web)
./manage.sh start --setup
```

### Access the Application

- **Web UI**: http://localhost:3000
- **API**: http://localhost:4000

### Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| `demo@example.com` | `demo1234` | Demo User |
| `admin@example.com` | `admin1234` | Admin |

## Configuration

The default configuration works without any API keys using mock models. Edit `.env` to customize:

```bash
# Required for production (generates with: openssl rand -hex 32)
API_KEY_ENCRYPTION_KEY=your-32-byte-key-here

# Optional: Add real AI providers
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...

# Optional: Enable semantic search
EMBEDDING_ENABLED=true
PGVECTOR_ENABLED=true
```

See [`.env.example`](.env.example) for all available options.

## Development

### Running in Development Mode

```bash
# Start infrastructure only
docker compose up -d

# Start dev servers (hot reload)
pnpm dev
```

### Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API + Web dev servers |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | TypeScript type checks |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Run Prettier |
| `./manage.sh start` | Start all services |
| `./manage.sh stop` | Stop all services |
| `./manage.sh health` | Check service health |

### Running Tests

```bash
# All tests (703 total)
pnpm test

# API tests only (661 tests)
cd apps/api && pnpm test

# Web tests only (42 tests)
cd apps/web && pnpm test

# With real API keys (integration tests)
RUN_LIVE_TESTS=1 pnpm test
```

## Architecture

```
research-workbench/
├── apps/
│   ├── api/                    # Fastify REST API
│   │   ├── src/routes/         # API endpoints
│   │   ├── src/services/       # Business logic
│   │   ├── src/orchestrator/   # Deliberation pipeline
│   │   └── prisma/             # Database schema
│   └── web/                    # Next.js frontend
│       ├── src/app/            # Pages (App Router)
│       ├── src/components/     # React components
│       └── src/hooks/          # Custom hooks
├── packages/
│   ├── shared/                 # Shared types and utilities
│   └── model-gateway/          # AI provider abstraction
├── docker-compose.yml          # PostgreSQL + Redis
└── manage.sh                   # Management scripts
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Fastify, TypeScript |
| Frontend | Next.js 14, React, Tailwind CSS |
| Database | PostgreSQL 16, Redis 7 |
| ORM | Prisma |
| Queue | BullMQ |
| State | Zustand, React Query |
| Testing | Vitest, Playwright |
| Validation | Zod |

## API Endpoints

### Authentication
```
POST   /auth/register          Create account
POST   /auth/login             Login
GET    /auth/me                Get current user
```

### Projects
```
GET    /projects               List projects
POST   /projects               Create project
GET    /projects/:id           Get project
PATCH  /projects/:id           Update project
DELETE /projects/:id           Delete project
```

### Deliberation
```
POST   /projects/:id/runs      Start deliberation
GET    /projects/:id/runs      List runs
GET    /runs/:id               Get run details
GET    /runs/:id/events        SSE event stream
POST   /runs/:id/cancel        Cancel run
```

### Claims & Evidence
```
GET    /projects/:id/claims         List claims
POST   /projects/:id/claims/extract Extract claims
GET    /projects/:id/evidence       List evidence
POST   /projects/:id/evidence/search Search evidence
```

### LaTeX
```
GET    /projects/:id/latex/documents      List documents
POST   /projects/:id/latex/documents      Create document
GET    /latex/documents/:id               Get document
PATCH  /latex/documents/:id               Update document
POST   /latex/documents/:id/compile       Compile document
WS     /ws/collaborate/:id                Real-time editing
```

### References
```
GET    /projects/:id/references           List references
POST   /projects/:id/references           Add reference
POST   /projects/:id/references/import    Import BibTeX/RIS
GET    /projects/:id/references/export    Export references
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection |
| `REDIS_URL` | `redis://...` | Redis connection |
| `API_KEY_ENCRYPTION_KEY` | (required) | Encryption key for API keys |
| `SEARCH_PROVIDER` | `mock` | Search: mock, web, searxng |
| `EMBEDDING_ENABLED` | `false` | Enable semantic search |
| `OPENROUTER_API_KEY` | (optional) | OpenRouter API key |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
