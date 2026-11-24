# Developer Setup Guide

## Supported path (recommended)

```bash
git clone https://github.com/Sutej12/agent-mesh.git
cd agent-mesh
cp .env.example .env
# Fill in the Supabase project, publishable key, and database connection values.
docker compose up --build
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Frontend |
| http://localhost:3000/office | Operator office |
| http://localhost:8000/docs | OpenAPI (non-production) |
| http://localhost:8000/healthz | Liveness |
| http://localhost:8000/readyz | Readiness (Supabase Postgres + Redis) |

## Quality gates

```bash
make install   # local venv + npm ci (optional if using containers only)
make check     # lint + typecheck + pytest (host)
make e2e-ci    # Demo Mode compose + Playwright
```

Normal `docker compose up` uses Supabase and does not start PostgreSQL locally. The
Playwright/CI overlay retains an isolated PostgreSQL container for hermetic tests:

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d postgres
make test-docker
```

## Branches

- `main` — releasable line used by this personal repo
- `develop` — integration branch (created for CS 691 MAIN/DEVELOP organization)

Do not push to the course remote `htmw/F2026-T2-Phoenix` from this finalization workflow.

## Technical paper

Not part of this repository’s authored content. Owner supplies separately — see [`MISSING_SUBMISSION_FILES.md`](../MISSING_SUBMISSION_FILES.md).
