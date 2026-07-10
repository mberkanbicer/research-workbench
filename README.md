# Research Workbench

[![CI](https://github.com/your-username/research-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/research-workbench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Evidence-grounded multi-model deliberation workbench. Enter research ideas and let multiple AI models collaboratively research, critique, revise, and finalize through structured deliberation with evidence-grounded claims.

## Features

- **Multi-model deliberation** — 8-stage pipeline: claim extraction → evidence assessment → independent review → cross-critique → critique response → idea revision → consensus vote → decision record
- **Real-time collaboration** — WebSocket-based editing with presence tracking, conflict resolution, and version history
- **Evidence management** — Evidence assessment, staleness monitoring, reliability scoring, and provenance tracking
- **LaTeX editor** — Full LaTeX editor with live preview, templates, and compilation
- **Reference manager** — BibTeX/RIS import, citation key generation, CSV/BibTeX export
- **Semantic search** — Optional pgvector-based semantic search across projects
- **Analytics** — Cohort analysis, trend detection, claim predictions, research recommendations
- **Argument mapping** — Toulmin argument map visualization and export
- **Reproducibility packs** — Export complete deliberation history for reproducibility

## Architecture

```
research-workbench/
├── apps/
│   ├── api/              # Fastify + TypeScript REST API (port 4000)
│   └── web/              # Next.js 14 App Router frontend (port 3000)
├── packages/
│   ├── shared/           # Zod schemas, TypeScript types, utilities
│   └── model-gateway/    # Model provider abstraction layer
├── docker-compose.yml    # PostgreSQL 16 + pgvector + Redis
└── manage.sh             # Management script
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- pnpm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/research-workbench.git
cd research-workbench

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Start infrastructure and seed data
./manage.sh start --setup
```

### Default URLs

- **Web UI**: http://localhost:3000
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/docs (Swagger)

### Default Login

| Email | Password |
|-------|----------|
| `demo@example.com` | `demo1234` |
| `admin@example.com` | `admin1234` |

Or create a new account at http://localhost:3000/signup.

## Configuration

Copy `.env.example` to `.env` and adjust as needed. The default configuration works without any API keys using mock models.

### Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_PROVIDER` | `mock` | Search provider: `mock`, `web`, `searxng`, `serpapi` |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://...` | Redis connection string |
| `API_KEY_ENCRYPTION_KEY` | (required) | Encryption key for API keys |
| `EMBEDDING_ENABLED` | `false` | Enable semantic search |
| `OPENROUTER_API_KEY` | (optional) | OpenRouter API key for real models |

See `.env.example` for all available configuration options.

## Development

### Running in Development Mode

```bash
# Start infrastructure
docker compose up -d

# Start dev servers (foreground)
pnpm dev
```

### Available Scripts

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

### Testing

```bash
# Run all tests
pnpm test

# Run API tests only
cd apps/api && pnpm test

# Run web tests only
cd apps/web && pnpm test

# Run with live API keys (requires real API keys)
RUN_LIVE_TESTS=1 pnpm test
```

## API Endpoints

### Authentication
- `POST /auth/register` — Create account
- `POST /auth/login` — Login
- `GET /auth/me` — Get current user

### Projects
- `GET /projects` — List projects
- `POST /projects` — Create project
- `GET /projects/:id` — Get project details
- `PATCH /projects/:id` — Update project
- `DELETE /projects/:id` — Delete project

### Deliberation
- `POST /projects/:id/runs` — Start deliberation run
- `GET /projects/:id/runs` — List runs
- `GET /runs/:id` — Get run details
- `GET /runs/:id/events` — SSE stream of run events

### Claims & Evidence
- `GET /projects/:id/claims` — List claims
- `POST /projects/:id/claims/extract` — Extract claims from idea
- `GET /projects/:id/evidence` — List evidence
- `POST /projects/:id/evidence/search` — Search for evidence

### LaTeX
- `GET /projects/:id/latex/documents` — List documents
- `POST /projects/:id/latex/documents` — Create document
- `POST /latex/documents/:id/compile` — Compile document
- `GET /ws/collaborate/:id` — WebSocket for real-time editing

### References
- `GET /projects/:id/references` — List references
- `POST /projects/:id/references/import` — Import BibTeX/RIS
- `GET /projects/:id/references/export` — Export references

See [docs/13-new-features.md](docs/13-new-features.md) for complete API documentation.

## Tech Stack

- **Backend**: Node.js, Fastify, TypeScript, Prisma ORM, BullMQ
- **Frontend**: Next.js 14, React, Tailwind CSS, Zustand, React Query
- **Database**: PostgreSQL 16 with pgvector, Redis 7
- **Testing**: Vitest, Playwright
- **Infrastructure**: Docker Compose

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Conventional commits for commit messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Fastify](https://www.fastify.io/)
- Frontend powered by [Next.js](https://nextjs.org/)
- Database backed by [PostgreSQL](https://www.postgresql.org/) with [pgvector](https://github.com/pgvector/pgvector)
