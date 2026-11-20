# Multi-year project lifecycle — design note

**Status:** Agreed design, not yet implemented. Deliberately deferred — see
"Why this is deferred" below. This note exists so the decisions reached in
discussion aren't lost in the months between now and whenever the Padma
Awards 2027 cycle actually ends.

## The problem

The portal currently has exactly one `Project` row, seeded directly into
the database — there is no in-app way to close it or to open a new one.
Every July/August the real-world Padma Awards profiling cycle restarts with
a team that's partly new hires and partly returning staff, and the system
needs to support that restart without losing a single week of the outgoing
cycle's history.

## Why this is deferred

This touches login/auth for every user and the project-scoping behavior
every single page in the app relies on (`req.user.project_id`). There is no
deadline pressure — the Padma Awards 2027 cycle isn't expected to end until
December/January — so this should be built and tested calmly between
cycles, never while a week is open and evaluations are actively being
submitted. **Do not start implementing this until the Master Admin
confirms the current cycle is actually ending.**

## Agreed design

### 1. Project lifecycle lives in Raw Data Browser's "Projects" tab

Every other table in Raw Data Browser stays exactly as it is today — pure
read-only view/export. `Projects` is the one exception and gets dedicated
actions instead of generic row editing:

- **Close this project** — sets `is_active = false`.
- **Create & open a new project** — small form (name, year, start date).
  Creating a new project **automatically closes whichever project is
  currently active** in the same action. Exactly one project is active at
  any time; this is never two independent toggles someone could leave
  inconsistent (both active, or neither).

### 2. Closing a project locks out everyone except Admins

- Enforced via the existing `authenticate` middleware (same place that
  already loads the live user row on every request) — add a check against
  `project.is_active`. Any non-Admin whose project is closed gets rejected
  (401/403) on their very next request. Since the frontend already polls/
  refetches via React Query, this naturally logs people out within moments
  without needing a separate session-kill mechanism — the JWT itself
  doesn't need to be revoked, the request is just refused.
- Admin and Master Admin accounts can still sign in while a project is
  closed (e.g. to do next-cycle setup, or finish wrapping up).
- Login page: a **persistent banner above the form** (not a popup/modal) —
  e.g. "This cycle has ended — thank you for participating. Check back
  when the next one opens." The form itself stays functional (Admins still
  need to type credentials); the banner is informational, not an error
  state, matching the calm tone of the rest of the app's messaging.

### 3. Opening a new project: roster carry-over

`importRoster` (`backend/src/services/roster.js`) already does most of
this — when it finds an existing user it relinks `project_id` to the new
project rather than creating a duplicate row. Two changes needed:

- **Match key**: currently matches by email only. Change to match by
  **either email or employee ID, whichever is available on that row** —
  a returning staff member's email may not persist year to year, but their
  Employee ID should.
- **Fresh credentials on carry-over**: when an existing user is matched
  and relinked to the new project, treat them like a new hire —
  regenerate their password and clear `credentials_sent_at`, so they go
  through "Send Login Credentials to All" → set their own password again,
  same as everyone else that cycle. (Current behavior leaves an existing
  user's password untouched on re-import — that needs to change for this
  flow specifically.)
- A person not present (by email or emp_id) in the new roster simply
  never gets relinked — they stay tied to the closed project as part of
  its historical record. This is how cycle-specific roles (e.g. this
  cycle's Project Leads, who will be replaced next cycle) naturally fall
  out of the system with **no special-case code**.

### 4. Opening a new project: Admin accounts move too

Every admin action is scoped by the Admin's own `project_id`, so Admin
accounts need to move to the new project to administer it at all.

- **Every current Admin moves to the new project automatically** by
  default.
- The Master Admin gets the option to pick which ones *don't* continue,
  for the (expected to be rare) case where an Admin was specific to the
  outgoing cycle.

### 5. Viewing historical projects — "View Project As"

Full historical browsing of old projects is wanted, through the **real
live pages** (Team View, Analytics, Compliance, Hall of Recognition, Data
Quality), not just Raw Data Browser's table view.

- Build this as a sibling to the existing **"View Portal As"** user
  impersonation feature, reusing the same mechanism: issue a token that
  keeps the Master Admin's real identity but overrides the effective
  `project_id` for the duration of the session. Every existing page
  already filters by `req.user.project_id`, so nothing about those pages
  needs to change — the override alone makes all of them show the
  historical project's data.
- Same UX pattern as impersonation: a banner — "Viewing historical
  project: Padma Awards 2027 (closed) — Return to [current project]".
- **Master-Admin-only.**
- **Strictly read-only.** While viewing a historical project this way,
  every mutating admin action is blocked — open/close a week, send any
  email, import a roster, unlock an evaluation, grant/revoke permissions,
  all of it. The only things allowed are:
  - **Export Scoresheets** (the existing export tab)
  - **Raw Data Browser** viewing/exporting (roster, evaluations, scores,
    tickets, etc.)

  There is no legitimate reason to ever write into, or email anyone on
  behalf of, a project that's already closed.
- Raw Data Browser gets a **project picker** so any past project's data —
  roster, peer mappings, self/peer evaluations, computed scores, tickets —
  stays fully browsable and exportable indefinitely, independent of
  "View Project As" (i.e. this works even without entering the full
  historical-view mode, exactly like Raw Data Browser works today, just
  with a project selector added).

### 6. Admin checklist for opening a new project

A static, step-by-step guide in the Admin Panel — same visual pattern as
the existing collapsible "How is this calculated?" guides — walking the
Master Admin through, in order:

1. Create & open the new project (Raw Data Browser → Projects)
2. Import the new team roster (matches continuing staff by email/emp ID,
   creates fresh accounts for new hires)
3. Review/confirm which Admins continued into the new project
4. Password management housekeeping if needed
5. Send Login Credentials to All (fresh temp passwords for everyone,
   including carried-over staff)
6. Ask users to log in and set their own password
7. Open Week 1

No open design questions here — this is meant to help whoever is Master
Admin at the time, in case it isn't the same person as today.

## Explicitly out of scope / not needed

- No per-project configuration of `FIELDS` (fields are a global constant,
  not project-scoped) — nothing to build there.
- No need to support more than one active project at a time.
- No need to ever delete a project or its historical data — everything
  stays in the database indefinitely, viewable via Raw Data Browser
  (always) and "View Project As" (Master-Admin-only, read-only).
