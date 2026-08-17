# Multi-tenant cutover runbook (open_spaces → communities/events)

Goal: adopt the existing production data under the `owu` community without data loss.
The repo is `db:push`-driven (no committed migrations), so the cutover is three
hand-applied SQL phases + one script, validated end-to-end against a local copy first.

**Order matters. Take a `pg_dump` before phases A, C and D.**

## Phase A — additive DDL (invisible to running code)

Everything is `CREATE TABLE` / `ADD COLUMN` (nullable or defaulted). Constraint
names mirror drizzle-kit's conventions so a later `db:push` reports **no drift**.

```sql
BEGIN;

CREATE TYPE "CommunityRole" AS ENUM ('owner', 'admin', 'editor', 'member');

CREATE TABLE "communities" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "logoUrl" text,
  "customDomain" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "communities_slug_unique" UNIQUE ("slug"),
  CONSTRAINT "communities_customDomain_unique" UNIQUE ("customDomain")
);

CREATE TABLE "community_members" (
  "id" text PRIMARY KEY NOT NULL,
  "communityId" text NOT NULL,
  "userId" text NOT NULL,
  "role" "CommunityRole" NOT NULL DEFAULT 'member',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "community_members_communityId_userId_key" UNIQUE ("communityId", "userId"),
  CONSTRAINT "community_members_communityId_communities_id_fk" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE,
  CONSTRAINT "community_members_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX "community_members_userId_idx" ON "community_members" ("userId");

ALTER TABLE "open_spaces" ADD COLUMN "communityId" text;
ALTER TABLE "open_spaces" ADD COLUMN "slug" text;
ALTER TABLE "open_spaces" ADD COLUMN "timezone" text NOT NULL DEFAULT 'America/Montevideo';
ALTER TABLE "open_spaces" ADD COLUMN "eventbriteEventId" text;
ALTER TABLE "open_spaces" ADD COLUMN "venueMapUrl" text;
ALTER TABLE "open_spaces" ADD CONSTRAINT "open_spaces_communityId_communities_id_fk" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE RESTRICT;
ALTER TABLE "open_spaces" ADD CONSTRAINT "open_spaces_communityId_slug_key" UNIQUE ("communityId", "slug");
CREATE INDEX "open_spaces_communityId_idx" ON "open_spaces" ("communityId");

CREATE TABLE "event_live_state" (
  "eventId" text PRIMARY KEY NOT NULL,
  "countdownTargetTime" timestamp(3),
  "countdownRemainingSeconds" integer NOT NULL DEFAULT 0,
  "countdownTotalSeconds" integer NOT NULL DEFAULT 0,
  "countdownSoundEnabled" boolean NOT NULL DEFAULT false,
  "highlightedTrackId" text,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "event_live_state_eventId_open_spaces_id_fk" FOREIGN KEY ("eventId") REFERENCES "open_spaces"("id") ON DELETE CASCADE,
  CONSTRAINT "event_live_state_highlightedTrackId_tracks_id_fk" FOREIGN KEY ("highlightedTrackId") REFERENCES "tracks"("id") ON DELETE SET NULL
);

ALTER TABLE "rooms" ADD COLUMN "color" text;
ALTER TABLE "rooms" ADD COLUMN "icon" text;
ALTER TABLE "rooms" ADD COLUMN "sortOrder" integer NOT NULL DEFAULT 0;
-- Give existing rooms a stable initial order (alphabetical, per event):
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY "openSpaceId" ORDER BY name) - 1 AS rn FROM rooms
)
UPDATE rooms SET "sortOrder" = ranked.rn FROM ranked WHERE rooms.id = ranked.id;
CREATE INDEX "schedules_openSpaceId_idx" ON "schedules" ("openSpaceId");
CREATE INDEX "rooms_openSpaceId_idx" ON "rooms" ("openSpaceId");
CREATE INDEX "tracks_openSpaceId_idx" ON "tracks" ("openSpaceId");

COMMIT;
```

## Phase B — backfill script (idempotent, transactional)

```bash
DATABASE_URL=<prod url> NEXT_PUBLIC_EVENTBRITE_EVENT_ID=<current env value> \
  pnpm db:backfill-communities --dry-run   # review output first
DATABASE_URL=<prod url> NEXT_PUBLIC_EVENTBRITE_EVENT_ID=<current env value> \
  pnpm db:backfill-communities
```

What it does (`src/lib/db/backfill-communities.ts`): creates community `owu`;
adopts every orphan `open_spaces` row (the `default-openspace` row gets slug
`la-meetup-2025`, others get slugified names); copies the `countdown_state`
global row and the out-of-band `highlighted_note` row (if the table exists)
into `event_live_state`; inserts memberships (site admins → `owner`, others →
`member`); pins `eventbriteEventId` from the env var. Fails loudly if any
orphan remains. Safe to re-run.

## Phase C — tighten (fails if backfill was incomplete — that's the safety check)

```sql
ALTER TABLE "open_spaces" ALTER COLUMN "communityId" SET NOT NULL;
ALTER TABLE "open_spaces" ALTER COLUMN "slug" SET NOT NULL;
```

Then verify: `DATABASE_URL=<prod url> pnpm db:push` must print **"No changes detected"**.

Deploy the app right after Phase C (old code never writes the new columns, but
event creation between C and deploy would fail — keep the window short).

Rollback: A/B are inert to old code (additive + idempotent). C reverts with
`ALTER TABLE open_spaces ALTER COLUMN "communityId" DROP NOT NULL;` (and same for slug).

## Phase D — cleanup (one release cycle later, after countdown/cast run on event_live_state)

1. Delete `countdownState` from `src/lib/db/schema.ts` → `pnpm db:push` drops the table.
2. Hand-drop the out-of-band tables (they are not in the Drizzle schema):
   ```sql
   DROP TABLE IF EXISTS "highlighted_note";
   DROP TABLE IF EXISTS "obs_queue_state";
   ```
3. Remove the `NEXT_PUBLIC_EVENTBRITE_EVENT_ID` env var (now read from `events.eventbriteEventId`).
4. Remove `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` once realtime
   is confirmed healthy on the WebSocket transport, and provision Upstash Redis
   (Vercel Marketplace) so `REDIS_URL`/`KV_URL` powers cross-instance fan-out.

## Validated locally (2026-08-16)

The full A → B → C sequence was executed against a seeded local copy; after each
phase `pnpm db:push` reported no drift, and the backfill verification printed
`communities=1 members=1 orphanEvents=0`.

## EXECUTED AGAINST PROD (2026-08-17) ✅

Run against the Neon prod DB (`ep-calm-dust-aciilq3b`), with a `pg_dump` taken
first. Sequence: Phase A → Staff tasks DDL → Phase B backfill (dry-run, then
real) → Phase C. Results:

- `LA Meetup 2024` (`default-openspace`) adopted as `owu/la-meetup-2025`;
  25 tracks / 5 rooms / 5 schedules untouched; countdown copied into
  `event_live_state`; 4 users → `owner` of `owu`; palette colors + `sortOrder`
  assigned to the 5 rooms. `highlighted_note` table did not exist (no-op).
- **Eventbrite pin skipped** (`NEXT_PUBLIC_EVENTBRITE_EVENT_ID` not available
  at run time) — set `events.eventbriteEventId` from the event's Ajustes tab.
- **Extra: pre-drizzle constraint drift fixed** (was not in the plan). Prod's
  Prisma-era tables used `*_fkey` FK names with `ON UPDATE CASCADE`, and
  UNIQUEs existed as plain indexes (`user_email_key`, `session_token_key`,
  `tracks_scheduleId_roomId_key`). Fixed by drop+recreate of 10 FKs with
  drizzle names/definitions (incl. the 3 `obs_*` ones — those tables ARE in
  schema.ts) and `ADD CONSTRAINT … UNIQUE USING INDEX` to promote/rename the
  three unique indexes in place.
- Verified: column, constraint, index and enum listings are **identical** to
  the drift-free local DB (`information_schema`/`pg_constraint`/`pg_indexes`/
  `pg_enum` diffs — empty). App-style join smoke test returns
  `owu|la-meetup-2025|America/Montevideo|25`.
- Do NOT run `drizzle-kit push` interactively against prod out of habit; the
  schema now matches, but the tool has nothing to add and a mis-click can drop.

**Pending after this**: deploy the new code promptly (old code creating an
event would violate the new NOT NULLs), then Phase D one release later
(`countdown_state` drop; the out-of-band tables in item 2 turned out not to
exist in prod, so that sub-step is a no-op).

## Staff tasks (additive — event-day coordination board)

Purely additive DDL for the `/admin/tareas` staff coordination page. Constraint
names mirror drizzle-kit's conventions so a later `pnpm db:push` reports **no
drift**. Safe to run any time (no existing data touched).

```sql
BEGIN;

CREATE TYPE "StaffTaskType" AS ENUM ('task', 'ongoing', 'milestone');
CREATE TYPE "StaffTaskStatus" AS ENUM ('pending', 'in_progress', 'done', 'blocked');
CREATE TYPE "AnnouncementAudience" AS ENUM ('all', 'task');

CREATE TABLE "staff_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "openSpaceId" text NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "type" "StaffTaskType" NOT NULL DEFAULT 'task',
  "dayDate" timestamp(3) NOT NULL,
  "startTime" text,
  "endTime" text,
  "minPeople" integer,
  "location" text,
  "status" "StaffTaskStatus" NOT NULL DEFAULT 'pending',
  "statusUpdatedById" text,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "staff_tasks_openSpaceId_open_spaces_id_fk" FOREIGN KEY ("openSpaceId") REFERENCES "open_spaces"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_tasks_statusUpdatedById_user_id_fk" FOREIGN KEY ("statusUpdatedById") REFERENCES "user"("id") ON DELETE SET NULL
);
CREATE INDEX "staff_tasks_openSpaceId_idx" ON "staff_tasks" ("openSpaceId");

CREATE TABLE "staff_task_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "taskId" text NOT NULL,
  "userId" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "staff_task_assignments_taskId_userId_key" UNIQUE ("taskId", "userId"),
  CONSTRAINT "staff_task_assignments_taskId_staff_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "staff_tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_task_assignments_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX "staff_task_assignments_userId_idx" ON "staff_task_assignments" ("userId");

CREATE TABLE "staff_announcements" (
  "id" text PRIMARY KEY NOT NULL,
  "openSpaceId" text NOT NULL,
  "authorId" text,
  "body" text NOT NULL,
  "urgent" boolean NOT NULL DEFAULT false,
  "audience" "AnnouncementAudience" NOT NULL DEFAULT 'all',
  "taskId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "staff_announcements_openSpaceId_open_spaces_id_fk" FOREIGN KEY ("openSpaceId") REFERENCES "open_spaces"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_announcements_authorId_user_id_fk" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "staff_announcements_taskId_staff_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "staff_tasks"("id") ON DELETE SET NULL
);
CREATE INDEX "staff_announcements_openSpaceId_createdAt_idx" ON "staff_announcements" ("openSpaceId", "createdAt");

CREATE TABLE "staff_announcement_acks" (
  "id" text PRIMARY KEY NOT NULL,
  "announcementId" text NOT NULL,
  "userId" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "staff_announcement_acks_announcementId_userId_key" UNIQUE ("announcementId", "userId"),
  -- Short explicit name: the drizzle auto-name exceeds Postgres' 63-char limit.
  CONSTRAINT "staff_announcement_acks_announcementId_fk" FOREIGN KEY ("announcementId") REFERENCES "staff_announcements"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_announcement_acks_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

COMMIT;
```
