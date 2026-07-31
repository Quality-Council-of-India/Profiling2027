# Profiling 2027 — Feedback Portal

A single portal replacing the manual Google Form → Google Sheets → Looker
Studio pipeline used to run the weekly self/peer feedback cycle for the QCI
Padma Awards Profiling Project. Built per `Profiling_2027_Feedback_Portal_Technical_Spec_v3.docx`.

It automates: self/peer evaluation collection, peer-mapping generation from
the team roster, weekly score computation (including the three peer
sub-cases and the SAPA factor), compliance tracking with reminder emails,
role-scoped dashboards/analytics, and Excel export — all backed by a real
relational database instead of a spreadsheet.

## Architecture

```mermaid
flowchart LR
    subgraph Client
        FE["React 18 + Vite SPA<br/>(Tailwind, Recharts, React Query)"]
    end
    subgraph Server["Nginx (SSL termination + routing)"]
        NG[nginx]
    end
    subgraph API["Node.js 20 + Express"]
        BE["Express API<br/>JWT auth, RBAC, score engine"]
        CRON["node-cron<br/>auto-reminder job"]
    end
    DB[("PostgreSQL 16<br/>via Prisma ORM")]
    MAIL[["SMTP (Nodemailer)"]]

    FE -- "HTTPS" --> NG
    NG -- "/ (static)" --> FE
    NG -- "/api/*" --> BE
    BE <--> DB
    BE -- "reminders / credentials" --> MAIL
    CRON --> BE
```

| Layer | Technology | Purpose |
|---|---|---|
| Frontend (SPA) | React 18 + Vite + Tailwind CSS | Role-aware UI, forms, dashboards, charts |
| API Layer | Node.js 20 + Express | REST API, business logic, score computation |
| Database | PostgreSQL 16 + Prisma ORM | Persistent storage, relational integrity |
| Auth | JWT + bcrypt | Token-based authentication, role-based access |
| Notifications | Nodemailer + node-cron | Automated email reminders for non-responders |
| Charts | Recharts + hand-rolled SVG/CSS (heatmap, quadrant, SAPA gauge) | Trend lines, radar, heatmaps, quadrant plot |
| Reverse Proxy | Nginx | SSL termination, static file serving, routing |
| Export | ExcelJS | `.xlsx` weekly + combined score sheets |
| Deployment | Docker + Docker Compose, **or** Vercel (serverless) | Reproducible builds; see "Deploying to Vercel" below for the serverless path |

## Repository layout

```
backend/
  prisma/schema.prisma      # projects, users, peer_mappings, weeks, evaluations, computed_scores
  prisma/seed.js            # demo roster (Padma 2026 actuals) + 6 weeks of synthetic evaluations
  src/server.js             # Express app entrypoint
  src/routes/*.routes.js     # one file per resource
  src/controllers/          # request handlers
  src/services/             # score engine, peer-mapping generator, compliance, analytics, export, mailer
  src/middleware/           # JWT auth, role guard, error handler
  src/jobs/reminderCron.js  # day-2-of-window auto-reminder sweep
  Dockerfile, docker-entrypoint.sh (runs `prisma migrate deploy` on boot)

frontend/
  src/pages/                # Login, Dashboard, Evaluate, Scores, Team, Compliance, Analytics, Admin
  src/components/           # Sidebar, Layout, ProtectedRoute, chart components
  src/api/                  # axios client + typed endpoint wrappers
  src/context/AuthContext.jsx
  Dockerfile, nginx.frontend.conf

deploy/nginx/nginx.conf     # root reverse proxy (SSL termination + routing)
docker-compose.yml          # postgres + backend + frontend + nginx

api/                        # Vercel serverless entrypoints (see "Deploying to Vercel")
  index.mjs                  # imports backend/src/app.js, exported as the Vercel Function handler
  cron/reminders.mjs         # Vercel Cron Job target — same reminder sweep as node-cron, triggered on schedule instead
vercel.json                 # build command, SPA/API rewrites, cron schedule
package.json                 # root npm workspaces (backend + frontend) — only used for the Vercel build
```

## Local development

Prerequisites: Node 20+, PostgreSQL 16 running locally (or point `DATABASE_URL` at any Postgres instance).

```bash
# 1. Database
createdb profiling2027   # or: psql -c "CREATE DATABASE profiling2027;"

# 2. Backend
cd backend
cp .env.example .env      # edit DATABASE_URL / JWT_SECRET as needed
npm install
npm run prisma:migrate    # applies schema
npm run seed               # loads demo roster + 6 weeks of seeded evaluations
npm run dev                 # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Demo login (any seeded user, e.g. the admin): **harshit.qci@gmail.com** /
**Profiling2027!** — see `backend/prisma/seed.js` for the full roster. The
seed reuses the same 10 people (with real names/roles/fields) from the
provided interactive prototype; the actual 61-person 2027 roster gets
loaded for real via **Admin Panel → Import Roster (.csv / .xlsx)**, which
also auto-regenerates `peer_mappings`.

## Environment variables

See `backend/.env.example` and `frontend/.env.example`. Notably:
- `JWT_SECRET` — required, no insecure default (the server refuses to boot without it).
- `SMTP_USER`/`SMTP_PASS` — if unset, the mailer falls back to a console-logging
  no-op transport so reminders/roster emails still "send" in dev without real SMTP.
- `REMINDER_CRON` — node-cron expression for the daily auto-reminder sweep (§4.4.04).

## Database schema

Six tables, mirroring the technical spec exactly: `projects` (one row per
award cycle, e.g. Padma 2027/2028 — this is what makes the platform
reusable year-on-year), `users`, `peer_mappings` (the digital "Ideal
Mapping" tab, auto-generated from role + field rules), `weeks`,
`evaluations` (one row per self/peer submission — replaces "Form
Responses 1"), and `computed_scores` (materialised weekly scores,
recomputed in real time on every submission — replaces the "Scores for
Week XX" tabs).

## Score computation engine (`backend/src/services/scoreEngine.js`)

- **Self**: direct scores if submitted, else all-zero.
- **Peer** — three sub-cases, all handled by one averaging rule: average
  across however many peer evaluations were received (0 peers → 0).
- **SAPA factor** = Total(Self) / Total(Peer), computed only when both are
  non-zero.
- Recomputed synchronously on every `POST /api/evaluations`, and in bulk
  when a week is closed (so non-responders still get a zeroed row) — the
  bulk path is a fixed number of queries regardless of roster size (batch
  read + one multi-row upsert), not one query per person; load-tested at
  ~1,000 users / ~93,000 evaluations closing a week in under 5 seconds.

## Access control

Enforced in `backend/src/services/access.js` per the spec's access matrix:
Profilers/Anchors see only their own scores (+ field team for anchors);
Project Lead sees all Profilers + Group Anchors but not CASU roles; CASU
Lead and Admin see everything; only Admin manages the roster and
opens/closes weeks. The same scoping drives which nav items and analytics
views the frontend renders.

**Team View** (`teamViewFilter`) is role-driven rather than a field the
client picks: a Group Anchor automatically sees their field's Profilers, a
CASU Anchor additionally sees the Group Anchor, a Project Lead sees every
Profiler + Group Anchor + the other Project Lead(s) across all fields, and
CASU Lead/Admin see everyone.

**Rankings** (`GET /api/analytics/rankings`, by Total Peer Score, single
week or averaged across several) always compute a requester's numeric
rank against the true full pool — a rank number alone doesn't expose
anyone's individual score — but only return the full named+scored list
when the requester's role already has per-user visibility into that
scope (Group/CASU Anchor get their field's list; CASU Lead/Admin get
everyone's; Project Lead gets Profilers+Group Anchors; a plain Profiler
gets their rank/count only, for both field and overall).

**Mid-project roster changes** (someone leaves partway through the
cycle): `PATCH /api/admin/users/:id/active` deactivates/reactivates a
user and regenerates `peer_mappings` so future weeks stop expecting
evaluations to/from them — already-computed `computed_scores` rows for
past weeks are never rewritten, preserving the historical record.

## API summary

All `/api/*` routes except `/api/auth/*` require `Authorization: Bearer <JWT>`.

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/reset-password`, `/api/auth/reset-password/confirm` | |
| GET | `/api/users/me` | |
| GET | `/api/weeks`, `/api/weeks/:id/status` | |
| POST | `/api/evaluations` | upserts; recomputes the evaluatee's score |
| GET | `/api/evaluations/pending` | for the current open week |
| GET | `/api/scores/:userId/:weekId`, `/api/scores/:userId/trend` | scoped per access matrix |
| GET | `/api/scores/team/:weekId` | Team View — role-driven, not a field the client picks (see §Access control) |
| GET/POST | `/api/compliance/:weekId`, `/api/compliance/:weekId/remind` | |
| GET | `/api/analytics/heatmap/:weekId`, `/api/analytics/sapa/:weekId`, `/api/analytics/quadrant/:weekId` | leads/admin only |
| GET | `/api/analytics/rankings?weeks=1,2,3` | every role — field + overall standing by Total Peer Score, one week or averaged across several |
| GET | `/api/analytics/hall-of-recognition` | every role — per closed week, top Total Peer Score by role (Profiler/Group Anchor/CASU Anchor) irrespective of field, plus a cumulative cross-role Overall Star Performer from the 2nd closed week onward; own top-level tab, not just Analytics |
| GET | `/api/export/scores/:weekId`, `/api/export/scores/combined` | `.xlsx` download, admin only — one row per professional, Self/Peer per parameter + subjective fields (Problem Reason and Strengths/Weakness Tags with frequency counts, peer strength/weakness comments concatenated; combined sheet prefixes each week's free-text remarks with `-> WEEK N` but sums tag frequencies cumulatively across all weeks) |
| GET | `/api/admin/data/:table/export` | admin only — `.xlsx` download of every row in `self_evaluations`/`peer_evaluations`, optionally filtered to one week; flattened columns (individual quantitative parameters, Field for evaluator+evaluatee, a per-submission Total) rather than the on-screen browser's compact view |
| POST | `/api/admin/weeks` | admin only — creates the next sequential week (auto-numbered/dated) |
| POST | `/api/admin/weeks/:id/open`, `/api/admin/weeks/:id/close`, `/api/admin/roster/import` | admin only; roster import accepts `.csv` or `.xlsx`, with an optional `photo_url` column (only touched when present, so an unrelated re-import never wipes existing photos) |
| GET/PATCH | `/api/admin/users`, `/api/admin/users/:id/active` | admin only — roster list + deactivate/reactivate for mid-project changes |
| PATCH | `/api/admin/users/:id/password` | admin only — sets a brand-new password directly; existing password hashes are never readable by anyone, including Admin |
| POST | `/api/admin/users/:id/send-reset` | admin only — sends the same reset-link email a user would get from "Forgot password?", on their behalf |
| GET | `/api/admin/data`, `/api/admin/data/:table` | admin only — view-only browser into every table (`projects`, `users`, `peer_mappings`, `weeks`, `self_evaluations`, `peer_evaluations`, `computed_scores`) |
| POST | `/api/admin/impersonate/:role` | admin only — "View portal as…"; signs a token for the first active user of that role, so Admin can preview Evaluate/My Scores/etc. as a real professional would see them |
| PATCH | `/api/admin/evaluations/:id/unlock` | admin only — lets one locked evaluation take exactly one corrective resubmission before re-locking |

## Deployment

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGIN, SMTP_*
docker compose build
docker compose up -d
```

This brings up Postgres, the API (migrations auto-applied via
`docker-entrypoint.sh` → `prisma migrate deploy`, running under PM2 inside
the container), the built frontend served by its own Nginx, and a root
Nginx reverse proxy on ports 80/443. Point your domain's DNS at the VM,
edit `server_name` in `deploy/nginx/nginx.conf`, then run
`certbot --nginx -d feedback.qcin.org` on the host to add the HTTPS server
block and auto-renewal. Seed the first cycle with
`docker compose exec backend npm run seed`, or import the real roster from
**Admin Panel** once logged in.

`docker compose config` and the individual Dockerfiles were validated in
this environment; a full `docker compose build` could not be exercised
end-to-end here because the sandbox's network policy blocks the Docker Hub
CDN (`production.cloudfront.docker.com`) used to fetch base image layers —
this is a sandbox restriction, not a project issue, and a normal cloud VM
with unrestricted egress will pull `node:20-alpine` / `nginx:1.27-alpine`
without trouble. The backend and frontend were otherwise fully verified
by running them directly (Node + Vite dev server) against a real local
Postgres instance, including a live browser walkthrough of every page for
every role.

## Deploying to Vercel

This is a second, serverless deployment path — an alternative to Docker
Compose above, not a replacement for it. The Express app (`backend/src/app.js`)
is exported as-is; Vercel's Node runtime invokes it directly per request,
so the API and the built SPA end up on the **same domain** (no CORS to
configure). The one thing a serverless platform can't do is run a
persistent process, so the node-cron reminder sweep is replaced by a
**Vercel Cron Job** hitting `/api/cron/reminders` on schedule instead —
same underlying logic (`backend/src/jobs/reminderCron.js`), different trigger.

**1. Create a Postgres database.** Any provider works as long as it gives
you both a *pooled* and a *direct/unpooled* connection string — required
because a serverless function can open far more concurrent connections
than a small Postgres instance allows, so runtime queries go through a
pooler while schema migrations (which must run outside it) use the direct
one. [Neon](https://neon.tech) is a good default (generous free tier,
first-class Prisma support); Vercel's own "Postgres" storage integration
(Storage tab → Create Database) and Supabase both work the same way.
Whichever you pick, copy out **both** connection strings.

**2. Import the repo into Vercel.** From the Vercel dashboard: **Add New
→ Project**, select this GitHub repo. Leave the root directory as `.`
(repo root) — `vercel.json` at the root already points the build at
`frontend/` and wires up `api/`, so no per-field configuration is needed
in the dashboard.

**3. Set environment variables** (Project → Settings → Environment
Variables). See `.env.vercel.example` for the full list — at minimum:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the **pooled** connection string from step 1 |
| `DIRECT_URL` | the **unpooled/direct** connection string from step 1 |
| `JWT_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | your sending mailbox (optional — reminders log to the function's console output if omitted) |
| `CRON_SECRET` | another long random string — Vercel sends it automatically as a Bearer token when firing the Cron Job, so anyone else calling that URL gets a 401 |

**4. Apply the schema — from your own machine, not Vercel's build.**
Vercel's build step deliberately does **not** run `prisma migrate deploy`
(see the callout below for why). Instead, from `backend/`, point a local
`.env` at your production `DATABASE_URL`/`DIRECT_URL` and run:

```bash
cd backend
npx prisma migrate deploy   # creates the six tables against your production DB
npm run seed                 # optional: demo roster + synthetic weeks, or skip and use Admin Panel → Import Roster instead
```

**5. Deploy.** Click **Deploy** (or push a commit). Vercel's build runs
`npm install` at the repo root (installs both workspaces + generates the
Prisma client via the `postinstall` hook), then `vercel.json`'s
`buildCommand` builds the frontend — no database connection needed at
build time at all.

> **Why migrations run locally instead of in `buildCommand`:** the first
> version of this setup ran `prisma migrate deploy` as part of the Vercel
> build. In testing, that failed with `P1001: Can't reach database
> server` against a Supabase project in the `ap-south-1` (Mumbai) region
> — while the exact same connection string worked fine from both
> Supabase's own SQL Editor and a local machine. That points to a
> region-specific gap between Vercel's *build* network and that Supabase
> pooler, not a bad connection string or a paused project. Since a
> transient build-time network hiccup shouldn't be able to block a
> frontend deploy, migrations were moved out of the build entirely — run
> them once per schema change from wherever you've confirmed connectivity
> works (local machine, or a CI runner in a region closer to your DB).
> If you hit the same `P1001` on a different provider/region, this same
> local-migration approach sidesteps it regardless of the cause.

**6. Verify the cron.** Project → Settings → Cron Jobs should show
`/api/cron/reminders` on the schedule from `vercel.json` (`0 10 * * *`,
UTC). You can also trigger it manually from that same screen to confirm
it runs before waiting for the schedule.

This path was verified locally by wrapping the exported `api/index.mjs`
and `api/cron/reminders.mjs` handlers in a plain Node `http.createServer`
(the same call signature Vercel's runtime uses) and exercising login,
score computation, and the cron endpoint's auth guard against a real
Postgres instance — `vercel dev`/an actual deployment couldn't be run here
since that requires an authenticated Vercel account this sandbox doesn't
have.

## Known limitations / next steps

- **Sentiment analysis** in the quadrant plot (`backend/src/services/analytics.js`)
  is a lightweight heuristic (Problem-Solving satisfied-ratio + strength/weakness
  tag balance), not a trained NLP model — swap in a real sentiment model if the
  Actionable Insights document's thematic analysis needs to go further.
- No automated test suite yet (verified via manual + scripted end-to-end
  smoke testing against a live Postgres instance and a live browser for this
  build). Add Vitest/Jest + Playwright if ongoing CI coverage is wanted.
- CI/CD (GitHub Actions auto-deploy) is listed in the spec's stack table but
  not wired up — natural next step once a target VM/registry exists.
- The auth rate limiter (`express-rate-limit`) uses an in-memory store,
  which is per-container: fine on a single long-running Docker/PM2 process,
  but on Vercel each cold-started function instance starts its own counter,
  so the limit is "per warm instance" rather than truly global. Swap in a
  Redis-backed store (e.g. Upstash, which pairs naturally with Vercel) if a
  hard global cap matters more than defense-in-depth against casual abuse.
