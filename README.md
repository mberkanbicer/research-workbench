# Research Workbench

Evidence-grounded multi-model deliberation workbench. Enter research ideas and let multiple AI models collaboratively research, critique, revise, and finalize through structured deliberation with evidence-grounded claims.

## Architecture

```
research-workbench/
  apps/
    api/         Fastify + TypeScript REST API (port 4000)
    web/         Next.js 14 App Router frontend (port 3000)
  packages/
    shared/      Zod schemas, TypeScript types, enums
    model-gateway/  Model provider abstraction (mock, OpenRouter, Ollama, OpenAI-compatible)
  infra/         Docker Compose for PostgreSQL 16 + pgvector + Redis
```

## Quick Start

```bash
# Prerequisites: Docker, Node 20+, pnpm 9+

pnpm install
./manage.sh start --setup
```

- API: http://localhost:4000
- Web: http://localhost:3000

### Default login credentials

| Email | Password | Role |
|-------|----------|------|
| `demo@example.com` | `demo1234` | Demo User |
| `admin@example.com` | `admin1234` | Admin |

Or create a new account at http://localhost:3000/signup.

## Key Scripts

| Script | Description |
|--------|-------------|
| `./manage.sh start` | Start infra + apps in background (auto-setup if DB empty) |
| `./manage.sh start --setup` | Force migrate + seed, then start |
| `./manage.sh setup` | Run migrations + seed only |
| `./manage.sh health` | Check postgres, redis, API health |
| `./manage.sh stop` | Stop apps + infrastructure |
| `pnpm dev` | Start API + Web dev servers (foreground) |
| `pnpm test` | Run all tests across packages |
| `SEARCH_PROVIDER=mock pnpm -r test` | Run tests without live search dependencies |
| `pnpm typecheck` | TypeScript type checks |
| `pnpm db:migrate` | Run Prisma migrations |
| `./manage.sh seed` | Seed demo users and mock models |

## Configuration

Copy `.env.example` to `.env` and adjust. Default ports:

- PostgreSQL: 5433
- Redis: 6380
- API: 4000
- Web: 3000

The default `SEARCH_PROVIDER=mock` works without any API keys. Three mock models are seeded automatically.

Override search for live web search:

```bash
SEARCH_PROVIDER=web ./manage.sh start
```

## Mock Mode (No API Keys Required)

Set `SEARCH_PROVIDER=mock` in `.env` and use the seeded mock models. The orchestrator produces deterministic outputs for all deliberation stages: claim extraction, evidence discovery, reviews, critiques, revision, and consensus.

## Project Status

MVP complete. **359 API tests** (5 skipped live-provider tests; enable with `RUN_LIVE_TESTS=1`). **7 web smoke tests**. All API endpoints implemented. Full deliberation pipeline runs end-to-end with mock models.

### Optional semantic retrieval

```bash
EMBEDDING_ENABLED=true ./manage.sh start
# For pgvector column + DB index (after DB exists):
./manage.sh pgvector
# Backfill embeddings for existing claims/evidence:
./manage.sh backfill-embeddings
```