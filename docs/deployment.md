# Deployment

## Topology

Four independently-deployed pieces:

1. **Web process** — the embedded app + all `app/routes/*` (admin UI, webhooks, `/api/*`). Stateless, horizontally scalable. `Dockerfile`.
2. **Worker process** — consumes the BullMQ queue (PDF generation, email sending). Long-running, **not** compatible with a serverless/functions runtime (spec §75) because it holds a persistent Redis connection and a warm Playwright/Chromium instance. `Dockerfile.worker` (based on `mcr.microsoft.com/playwright`, so the exact Chromium build Playwright expects is already present — keep its tag in sync with the `playwright` version pinned in `package.json`).
3. **Postgres** — any managed Postgres 14+ (Railway, Render, RDS, Supabase, Neon, etc.).
4. **Redis** — any managed Redis 6+ (Railway, Render, Upstash, ElastiCache, etc.).

## Platform notes

- **Vercel**: works for the web process (it's a standard React Router/Vite app). **Do not** try to run the worker as a Vercel function — deploy it separately (Railway/Render/Fly/a small always-on container) with a persistent connection to the same Postgres and Redis.
- **Railway / Render / Fly.io**: both the web and worker Dockerfiles run as-is as two separate services pointed at the same `DATABASE_URL`/`REDIS_URL`.
- **AWS**: web process as an ECS/Fargate service (or Elastic Beanstalk); worker as its own ECS/Fargate service with the Playwright-based image; RDS for Postgres; ElastiCache for Redis.

## Release checklist

```bash
npm ci
npm run prisma:generate
npx prisma migrate deploy   # applies pending migrations — never `migrate dev` in production
npm run build
```

Then deploy the web image and the worker image. `npm run docker-start` (used by `Dockerfile`'s `CMD`) runs `prisma migrate deploy` automatically before starting the web server — the worker image does not re-run migrations to avoid two processes racing to apply the same migration; `prisma migrate deploy` is idempotent, but only one process needs to actually run it.

## Health endpoints

- `GET /health` — liveness, no dependencies checked.
- `GET /ready` — readiness, pings Postgres.
- `GET /api/health` (authenticated) — per-component status (Database, Queue/Redis, Storage, Email provider, Shopify API config) surfaced in the admin UI at `/app/health`.

## Scaling the worker

`WORKER_CONCURRENCY` (default 5) controls how many jobs one worker process handles in parallel. Playwright/Chromium is the heaviest part of a job — profile memory before raising this much past the default on a small instance.
