# Auto Invoice PDF

A Shopify embedded app that automatically generates a professional PDF invoice for every order and emails it to the customer.

```
Order created → orders/create webhook → validate + dedupe → queue job
  → fetch full order (GraphQL) → create invoice (atomic numbering)
  → render PDF (Playwright) → store (S3/R2/local) → email (Resend/SMTP)
```

Built for **Spill Ready Supplies** as a single-merchant custom app (see `docs/shopify-setup.md` §Distribution for what changes if you ever list it publicly). The multi-tenant schema and architecture are still fully in place — this is a design choice, not a limitation, and the app supports installing on more than one shop as-is.

## Status

This is the MVP pass: install/auth, the full order → invoice → PDF → email pipeline, the admin dashboard/invoices/settings UI, health checks, GDPR webhook handlers (unregistered until you distribute publicly), and a unit test suite. Deliberately **not** built yet (see `docs/architecture.md` §Roadmap): credit note UI (schema exists), the order-detail admin UI extension, bulk actions, and end-to-end/integration test suites. None of it is stubbed with fake logic — what's built is real, working code; what isn't built yet simply isn't there.

## Tech stack

TypeScript, React Router 7 (Shopify's current app framework, replacing Remix), Shopify App Bridge + Polaris web components, GraphQL Admin API (2025-10), PostgreSQL + Prisma, BullMQ + Redis, Playwright (PDF rendering), Resend (email, with an SMTP fallback and SendGrid/SES stubs), S3-compatible object storage (works with AWS S3, Cloudflare R2, and Supabase Storage), Docker, Vitest.

## Local development

1. **Install Node** 22.12+ (or 20.19+) and the **Shopify CLI**: `npm install -g @shopify/cli`.
2. **Create a Shopify Partner account** and a development store if you don't have one: https://partners.shopify.com
3. **Create the app in your Partner Dashboard**, or let the CLI do it: `npm install`, then `shopify app config link` (this fills in `client_id` in `shopify.app.toml`).
4. **Copy `.env.example` to `.env`** and fill in `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` (from the Partner Dashboard) and a random `SESSION_SECRET`.
5. **Start Postgres and Redis.** Easiest path: `docker compose up postgres redis -d`. (No Docker? Point `DATABASE_URL`/`REDIS_URL` at any Postgres 14+ / Redis 6+ instance.)
6. **Run Prisma migrations**: `npm run prisma:migrate` (first run; creates the database schema).
7. *(Optional)* **Seed demo data**: `npm run seed` — adds a sample shop + one sample invoice so the admin UI isn't empty on first look.
8. **Start the app**: `npm run dev` (this runs `shopify app dev`, which tunnels the app and prints an install link).
9. **Start the worker in a second terminal**: `npm run worker`. Nothing gets generated without this running — the web process only enqueues jobs.
10. **Install the app** on your development store via the link the CLI prints.
11. **Place a test order** on the dev store (Shopify has a "Bogus Gateway" test payment method for dev stores).
12. **Verify the webhook fired**: check the worker's logs, or Settings → (none yet — check `app/routes/webhooks.orders.create.tsx` logs) / the Invoices list in the admin UI.
13. **Verify the PDF**: open the invoice from the Invoices list and click "Download PDF".
14. **Verify the email**: Settings → Email defaults to test mode ON — set a test email address there, or turn test mode off once you're ready for real customers to receive invoices.

PDF rendering needs a Chromium binary that Playwright downloads separately from the npm package — if step 13 fails with an "executable doesn't exist" error, run `npx playwright install chromium` once after `npm install`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the Shopify-tunneled dev server (web process only) |
| `npm run worker` | Starts the background job worker (PDF + email), with file watching |
| `npm run build` | Production build of the web app |
| `npm start` | Runs the built web app |
| `npm run worker:start` | Runs the built worker (no file watching) |
| `npm run typecheck` | `react-router typegen && tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run prisma:generate` / `prisma:migrate` / `prisma:studio` | Prisma workflows |
| `npm run seed` | Loads demo data |

## Project structure

```
app/                   React Router routes (admin UI, webhooks, API routes)
  routes/
server/                Framework-agnostic application code
  shopify/              Centralized GraphQL queries + order/shop normalization
  invoices/              Invoice numbering + creation
  pdf/                    HTML→PDF invoice engine (Playwright)
  email/                  Provider abstraction, templates, delivery logging
  storage/                Local-filesystem / S3-compatible storage abstraction
  queue/                  BullMQ jobs, handlers, and the worker entrypoint
  webhooks/               Webhook idempotency
  settings/               Settings initialization/validation
  lib/                    Logging, errors, money (Decimal), audit log
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/unit/             Vitest unit tests
docs/                    Deep-dive docs referenced throughout this README
Dockerfile               Web process image
Dockerfile.worker        Worker process image (Playwright base image)
docker-compose.yml       Local dev stack (Postgres, Redis, app, worker)
```

## Environment variables

See `.env.example` for the full list with comments. The short version: Shopify credentials, `DATABASE_URL`, `SESSION_SECRET`, one of (`RESEND_API_KEY`) or (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`), `REDIS_URL`, and — in production — `STORAGE_PROVIDER=s3` (or `r2`/`supabase`) plus `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_ENDPOINT`.

## Deployment

See `docs/deployment.md`. Short version: the web process and the worker process are two separate deployments (Railway/Render/Fly/AWS all work; Vercel works for the web process only — its functions can't run the long-lived worker). Never deploy the worker to a serverless runtime.

## Docs

- `docs/architecture.md` — full request/data flow, and what's deliberately not built yet
- `docs/shopify-setup.md` — scopes, webhooks, distribution
- `docs/pdf.md` — the PDF engine, versioning, customization
- `docs/email.md` — delivery modes, templates, duplicate-send protection
- `docs/storage.md` — provider abstraction, signed URLs
- `docs/webhooks.md` — idempotency, retry, GDPR compliance webhooks
- `docs/deployment.md` — production topology
- `docs/troubleshooting.md` — common local-dev issues

## Legal

This app is not legal or tax advice. The merchant is responsible for ensuring invoice content complies with applicable tax and accounting laws in their jurisdiction (spec §119).
