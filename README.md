# Big5Loop

**Adaptive Personality-Aware Caregiver Assistant**

Big5Loop is a Swiss caregiver support assistant that combines continuous OCEAN (Big Five) personality inference with Retrieval-Augmented Generation (RAG) to deliver emotionally adaptive, policy-grounded responses. It is built as a thesis project at HSLU and targets real-world Swiss caregiver workflows.

---

## Overview

- **Personality-aware dialogue** — Infers OCEAN traits continuously via EMA smoothing and adapts response style per turn.
- **RAG and policy navigation** — Retrieves grounded Swiss policy chunks with citations; no factual claim is made without source evidence.
- **Auditable and privacy-aware** — Full conversation audit log, feedback collection, data export/delete, and reproducible contracts.
- **Swiss deployment** — Multilingual support (de, fr, it, en), canton-specific policy corpus, and compliance-oriented design.

---

## Architecture

```
User Input
  → Detection (OCEAN + confidence)
  → EMA State Update (per trait)
  → Regulation (behavioral directives + mode)
  → Retrieval (RAG, conditional)
  → Generation (Gemma 3 via NVIDIA endpoint)
  → Verification (grounding check)
  → Persistence + Audit
  → Client Response
```

**Stack:**

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Zustand |
| Orchestrator | N8N workflow engine |
| Model runtime | `google/gemma-3-12b-it` via OpenAI-compatible endpoint (NVIDIA) |
| Database | PostgreSQL + pgvector |
| Contracts | Zod schemas (`@big5loop/contracts`) |
| Infrastructure | Docker Compose, Nginx |

---

## Project Structure

```
Big5Loop/
├── apps/web/               # Next.js chat UI and API routes
├── packages/contracts/     # Shared Zod schemas and EMA helpers
├── workflows/n8n/          # N8N workflow exports
├── infra/
│   ├── database/           # PostgreSQL schema and migrations
│   ├── docker/             # Docker Compose files
│   └── deploy/nginx/       # Nginx reverse proxy config
├── scripts/                # Deployment, RAG seeding, and job scripts
├── data/                   # Policy corpus sources and crawlers
├── evaluation_data/        # OCEAN evaluation datasets and analysis
└── visualization/          # Architecture diagrams and manuscript figures
```

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- An NVIDIA API key (for Gemma 3 inference)

### 1. Environment setup

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and NVIDIA_API_KEY at minimum
```

### 2. Start the full stack

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up --build
```

| Service | URL |
|---|---|
| Next.js frontend | http://localhost:3000 |
| N8N orchestrator | http://localhost:5678 |
| PostgreSQL | localhost:5432 |

For production:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.production.yml up --build -d
```

Or run only DB + N8N and develop the frontend locally:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d db n8n
npm run dev --workspace=web
```

### 3. Import N8N workflows

1. Open http://localhost:5678
2. Import and activate `workflows/n8n/big5loop-phase1-2-postgres-mvp.json` (webhook: `big5loop-turn`)
3. Optionally import `workflows/n8n/big5loop-turn-simple.json` for Simple mode

### 4. Install dependencies and typecheck

```bash
npm install
npm run typecheck
npm run test:parse --workspace=@big5loop/contracts
```

### 5. Seed the policy corpus (Phase 2+)

```bash
npm run seed:policy   # requires DATABASE_URL to be set
```

---

## Development

```bash
# Run frontend in dev mode
npm run dev --workspace=web

# Lint all workspaces
npm run lint

# Typecheck all workspaces
npm run typecheck

# Run background jobs
npm run job:corpus-freshness
npm run job:retrieval-smoke
```

---

## Configuration

All configuration is via environment variables. Copy `.env.example` and fill in the required values:

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL password (required) |
| `NVIDIA_API_KEY` | API key for Gemma 3 inference endpoint |
| `NVIDIA_API_URL` | OpenAI-compatible base URL |
| `NVIDIA_MODEL` | Model identifier (default: `google/gemma-3-12b-it`) |
| `NEXTAUTH_SECRET` | Session signing secret |
| `N8N_WEBHOOK_URL` | Base URL for N8N webhooks |

See `.env.example` and `.env.production.example` for the full variable reference.

---

## Operations

- **Health check:** `GET /api/health`
- **Audit logs and feedback:** accessible via the Operations Dashboard in the UI
- **Data export/delete:** `POST /api/data/export`, `POST /api/data/delete`
- **Gateway entry point:** `POST /api/gateway/chat` (envelope with optional auth, rate limiting, and model tier routing)
- **Operations dashboard:** audit logs, feedback, and health status in the UI

---

## Roadmap

| Phase | Period | Focus | Status |
|---|---|---|---|
| Phase 0 | Dec 2025 | Infrastructure, contracts, chat shell, N8N skeleton, DB schema | ✅ Done |
| Phase 1 | Jan 2026 | MVP dialogue loop: Detection → EMA → Mode → Generation → Response | ✅ Done |
| Phase 2 | Jan–Feb 2026 | RAG and policy navigation with citations | ✅ Done |
| Phase 3 | Feb 2026 | Reliability, observability, and security hardening | ✅ Done |
| Phase 4 | Feb–Mar 2026 | Pilot release and evaluation | ✅ Done |
| Phase 5 | Mar 2026+ | PANDORA (Reddit Big Five) external evaluation | 🔄 In progress |

See [ROADMAP.md](ROADMAP.md) for detailed phase breakdowns and Definition of Done.

---

## Documentation

| Document | Description |
|---|---|
| [Technical-Specification-RAG-Policy-Navigation.md](Technical-Specification-RAG-Policy-Navigation.md) | Full system specification (v1.5.0) |
| [ROADMAP.md](ROADMAP.md) | Phased implementation plan |
| [evaluation_data/PHASE5-SPECIFICATION.md](evaluation_data/PHASE5-SPECIFICATION.md) | Phase 5: layout, data transforms, workflow name/version, tests |
| [evaluation_data/PHASE5-PANDORA.md](evaluation_data/PHASE5-PANDORA.md) | Phase 5: short overview (links to spec) |

---

## License

This project is developed as part of a Master's thesis at HSLU. All rights reserved.
