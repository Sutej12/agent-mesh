# Deploying to Render

Agent Mesh deploys its web/API services to [Render](https://render.com) while Supabase
provides PostgreSQL and Google authentication. The Blueprint provisions the web/API and
Redis-compatible services; no Render PostgreSQL instance is provisioned.

| Resource | Render type | Purpose |
|----------|-------------|---------|
| Supabase project | Hosted PostgreSQL + Auth | durable state and Google sessions |
| `agent-mesh-redis` | Key Value | rate limits, cache, locks |
| `agent-mesh-api` | Web (Docker) | FastAPI backend |
| `agent-mesh-web` | Web (Docker) | Next.js frontend |

## One-click deploy

1. Make sure `render.yaml` is committed at the repo root (it is).
2. In the README, click **Deploy to Render** — or, in the Render dashboard:
   **New → Blueprint → select this repo → Apply**.
3. Supply the prompted Supabase database URL, project URL, and publishable key.
4. Render builds both images, runs database migrations on the API's first boot, seeds the
   built-in agents, and starts everything. First build takes a few minutes.

The app comes up in **demo mode**: with no provider key set, a built-in fake provider
returns simulated responses so the whole pipeline works end-to-end.

## Going live with real AI

On the **`agent-mesh-api`** service → **Environment**, set `OPENAI_API_KEY` (and/or any of
`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, etc.), then **Manual Deploy → Deploy latest commit**.
The office then routes to real models. Keys are read only by the backend and never sent to
the browser.

## How it is wired

- **Database URL** is supplied as a secret from Supabase's Direct or Session Pooler
  connection. The backend converts `postgres(ql)://` to the asyncpg SQLAlchemy driver and
  applies its explicit TLS settings.
- **Migrations** run on container start (`alembic upgrade head && uvicorn …`), so no paid
  pre-deploy step is needed. Migrations are idempotent and safe on a single instance.
- **Port**: Render assigns `$PORT`; the API's start command binds uvicorn to it.
- **Frontend API base**: `NEXT_PUBLIC_API_BASE_URL` is a build argument because Next.js
  inlines `NEXT_PUBLIC_*` into the client bundle at build time.
- **CORS**: the backend allows the frontend's Render URL; both default to the service
  names in `render.yaml`.

## Environment reference (set in `render.yaml` unless noted)

| Variable | Value | Notes |
|----------|-------|-------|
| `ENVIRONMENT` | `staging` | not `production`, so docs stay on and agents seed on boot |
| `AUTH_MODE` | `supabase` | requires a verified Supabase access JWT |
| `DATABASE_URL` | you set it | Supabase Direct or Session Pooler URL; server secret |
| `DATABASE_SSL_MODE` | `require` | use `verify-full` plus the Supabase CA when practical |
| `SUPABASE_URL` | you set it | backend JWT issuer/JWKS base |
| `REDIS_URL` | from `agent-mesh-redis` | |
| `CORS_ALLOW_ORIGINS` | `https://agent-mesh-web.onrender.com` | the frontend URL |
| `NEXT_PUBLIC_API_BASE_URL` | `https://agent-mesh-api.onrender.com` | the backend URL (build arg) |
| `OPENAI_API_KEY` | you set it | optional; demo mode without it |
| `NEXT_PUBLIC_SUPABASE_URL` | you set it | public Supabase project URL (build arg) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | you set it | public browser key (build arg) |
| `NEXT_PUBLIC_SITE_URL` | frontend URL | OAuth callback origin (build arg) |

## Notes and limits

- **Free plan** Render web services sleep when idle. Size the Supabase database and its
  connection pool separately; start with the small pool limits in `render.yaml`.
- **URL collisions**: Render derives each service URL from its name. If
  `agent-mesh-api`/`agent-mesh-web` are already taken globally, Render appends a suffix;
  update `NEXT_PUBLIC_API_BASE_URL`, `BACKEND_INTERNAL_URL`, and `CORS_ALLOW_ORIGINS` to
  match the real URLs and redeploy.
- **Google sign-in** is configured in Supabase Auth. Add the frontend URL as a Google
  authorized origin, use `https://<project-ref>.supabase.co/auth/v1/callback` as Google's
  redirect URI, and allow the frontend's `/auth/callback` URL in Supabase.
