# Organizá database runbook

What the Organizá PR adds to the database, and how to apply it to production by hand before
deploying. Everything is additive: new tables, and new columns that are nullable or have a
default, so the code running in production keeps working before and after.

The repo is `db:push`-driven (no committed migrations). These statements are what
`drizzle-kit push` generates from #310's schema to this branch's, checked locally: after
applying them, a push lists only the known churn below.

**Never run any of this from an agent session. Agustín applies it.**

## 1. Before

- Take a `pg_dump` of production.
- Try everything first on a Neon branch of production (steps 2–4), then on production.
- #310 (`salary_surveys`, `semanario_issues`) must already be applied.

## 2. Apply the DDL

`lock_timeout` makes a statement give up instead of queueing behind a long query and blocking
the site; if it fails, run it again.

```sql
SET lock_timeout = '3s';
BEGIN;

CREATE TABLE "community_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"communityId" text NOT NULL,
	"userId" text NOT NULL,
	"relation" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"link" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewedById" text,
	"reviewedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "community_claims_communityId_userId_key" UNIQUE("communityId","userId")
);
CREATE TABLE "community_followers" (
	"communityId" text NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "community_followers_pkey" PRIMARY KEY("communityId","userId")
);
CREATE TABLE "date_poll_votes" (
	"pollId" text NOT NULL,
	"communityId" text NOT NULL,
	"day" text NOT NULL,
	"answer" text NOT NULL,
	"votedById" text,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "date_poll_votes_pkey" PRIMARY KEY("pollId","communityId","day")
);
CREATE TABLE "date_polls" (
	"id" text PRIMARY KEY NOT NULL,
	"communityId" text NOT NULL,
	"title" text NOT NULL,
	"days" text[] NOT NULL,
	"startTime" text DEFAULT '19:00' NOT NULL,
	"durationMin" integer DEFAULT 120 NOT NULL,
	"invited" text[] DEFAULT '{}' NOT NULL,
	"chosenDay" text,
	"eventId" text,
	"createdById" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
CREATE TABLE "email_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedupeKey" text NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextAttemptAt" timestamp (3) DEFAULT now() NOT NULL,
	"claimedAt" timestamp (3),
	"providerId" text,
	"error" text,
	"sentAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_dedupeKey_key" UNIQUE("dedupeKey")
);
CREATE TABLE "email_suppressions" (
	"email" text NOT NULL,
	"scope" text DEFAULT 'reminders' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_email_scope_key" UNIQUE("email","scope")
);
CREATE TABLE "event_hosts" (
	"eventId" text NOT NULL,
	"communityId" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invitedById" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "event_hosts_pkey" PRIMARY KEY("eventId","communityId")
);
CREATE TABLE "event_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"eventId" text NOT NULL,
	"connectionId" text NOT NULL,
	"platform" text DEFAULT 'eventbrite' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"externalId" text,
	"externalUrl" text,
	"ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pushedHash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextAttemptAt" timestamp (3),
	"claimedAt" timestamp (3),
	"error" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "event_publications_eventId_platform_key" UNIQUE("eventId","platform")
);
CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"communityId" text NOT NULL,
	"platform" text DEFAULT 'eventbrite' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"token" text NOT NULL,
	"organizationId" text NOT NULL,
	"accountName" text DEFAULT '' NOT NULL,
	"webhookKey" text NOT NULL,
	"webhookId" text,
	"error" text,
	"connectedById" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connections_communityId_platform_key" UNIQUE("communityId","platform"),
	CONSTRAINT "integration_connections_webhookKey_key" UNIQUE("webhookKey")
);
CREATE TABLE "venue_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"venueId" text NOT NULL,
	"userId" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"consentAt" timestamp (3) NOT NULL,
	"consentNote" text DEFAULT '' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "venue_contacts_venueId_email_key" UNIQUE("venueId","email")
);
CREATE TABLE "venue_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"venueId" text NOT NULL,
	"communityId" text NOT NULL,
	"eventId" text,
	"requestedById" text,
	"options" jsonb NOT NULL,
	"expectedAttendees" integer NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"chosenOption" integer,
	"hostMessage" text,
	"shareContact" boolean DEFAULT false NOT NULL,
	"respondedAt" timestamp (3),
	"expiresAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
CREATE TABLE "venues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"neighbourhood" text DEFAULT '' NOT NULL,
	"city" text DEFAULT 'Montevideo' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"mapUrl" text,
	"capacity" integer,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"hostDays" integer[] DEFAULT '{}' NOT NULL,
	"availability" text DEFAULT '' NOT NULL,
	"leadDays" integer DEFAULT 14 NOT NULL,
	"monthlyCap" integer,
	"addressVisibility" text DEFAULT 'attendees' NOT NULL,
	"logoUrl" text,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requestable" boolean DEFAULT false NOT NULL,
	"fallback" boolean DEFAULT false NOT NULL,
	"submittedById" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
ALTER TABLE "attendees" ALTER COLUMN "eventbriteId" DROP NOT NULL;
ALTER TABLE "attendees" ADD COLUMN "source" text DEFAULT 'eventbrite' NOT NULL;
ALTER TABLE "attendees" ADD COLUMN "userId" text;
ALTER TABLE "attendees" ADD COLUMN "guests" integer DEFAULT 0 NOT NULL;
ALTER TABLE "attendees" ADD COLUMN "answers" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "attendees" ADD COLUMN "showName" boolean DEFAULT false NOT NULL;
ALTER TABLE "attendees" ADD COLUMN "offerExpiresAt" timestamp (3);
ALTER TABLE "communities" ADD COLUMN "status" text DEFAULT 'activa' NOT NULL;
ALTER TABLE "communities" ADD COLUMN "topics" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "communities" ADD COLUMN "links" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "communities" ADD COLUMN "slackChannel" text;
ALTER TABLE "communities" ADD COLUMN "feedNames" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "communities" ADD COLUMN "confPartner" boolean DEFAULT false NOT NULL;
ALTER TABLE "communities" ADD COLUMN "reviewedAt" date;
ALTER TABLE "communities" ADD COLUMN "listed" boolean DEFAULT false NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "heldUntil" timestamp (3);
ALTER TABLE "open_spaces" ADD COLUMN "format" text;
ALTER TABLE "open_spaces" ADD COLUMN "summary" text;
ALTER TABLE "open_spaces" ADD COLUMN "topics" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "onlineUrl" text;
ALTER TABLE "open_spaces" ADD COLUMN "venueId" text;
ALTER TABLE "open_spaces" ADD COLUMN "mode" text DEFAULT 'presencial' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "placeName" text;
ALTER TABLE "open_spaces" ADD COLUMN "placeAddress" text;
ALTER TABLE "open_spaces" ADD COLUMN "registration" text DEFAULT 'none' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "registrationUrl" text;
ALTER TABLE "open_spaces" ADD COLUMN "approval" boolean DEFAULT false NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "capacity" integer;
ALTER TABLE "open_spaces" ADD COLUMN "waitlist" boolean DEFAULT true NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "guestsAllowed" integer DEFAULT 0 NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "rsvpClosesAt" timestamp (3);
ALTER TABLE "open_spaces" ADD COLUMN "questions" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "externalLinks" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "sizeBucket" text;
ALTER TABLE "open_spaces" ADD COLUMN "needs" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "talks" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "announcement" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "publishAt" timestamp (3);
ALTER TABLE "open_spaces" ADD COLUMN "publishById" text;
ALTER TABLE "open_spaces" ADD COLUMN "reminderNote" text;
ALTER TABLE "open_spaces" ADD COLUMN "materials" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "icsSequence" integer DEFAULT 0 NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "notifiedSequence" integer DEFAULT 0 NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "doorVersion" integer DEFAULT 0 NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "publishedAt" timestamp (3);
ALTER TABLE "community_members" ADD COLUMN "showOnProfile" boolean DEFAULT false NOT NULL;
ALTER TABLE "community_claims" ADD CONSTRAINT "community_claims_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "community_claims" ADD CONSTRAINT "community_claims_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "community_claims" ADD CONSTRAINT "community_claims_reviewedById_fk" FOREIGN KEY ("reviewedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "community_followers" ADD CONSTRAINT "community_followers_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "community_followers" ADD CONSTRAINT "community_followers_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "date_poll_votes" ADD CONSTRAINT "date_poll_votes_pollId_fk" FOREIGN KEY ("pollId") REFERENCES "public"."date_polls"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "date_poll_votes" ADD CONSTRAINT "date_poll_votes_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "date_poll_votes" ADD CONSTRAINT "date_poll_votes_votedById_fk" FOREIGN KEY ("votedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "date_polls" ADD CONSTRAINT "date_polls_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "date_polls" ADD CONSTRAINT "date_polls_eventId_fk" FOREIGN KEY ("eventId") REFERENCES "public"."open_spaces"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "date_polls" ADD CONSTRAINT "date_polls_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_hosts" ADD CONSTRAINT "event_hosts_eventId_fk" FOREIGN KEY ("eventId") REFERENCES "public"."open_spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_hosts" ADD CONSTRAINT "event_hosts_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_hosts" ADD CONSTRAINT "event_hosts_invitedById_fk" FOREIGN KEY ("invitedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_publications" ADD CONSTRAINT "event_publications_eventId_fk" FOREIGN KEY ("eventId") REFERENCES "public"."open_spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_publications" ADD CONSTRAINT "event_publications_connectionId_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_connectedById_fk" FOREIGN KEY ("connectedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "venue_contacts" ADD CONSTRAINT "venue_contacts_venueId_fk" FOREIGN KEY ("venueId") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "venue_contacts" ADD CONSTRAINT "venue_contacts_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_venueId_fk" FOREIGN KEY ("venueId") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_eventId_fk" FOREIGN KEY ("eventId") REFERENCES "public"."open_spaces"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_requestedById_fk" FOREIGN KEY ("requestedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "venues" ADD CONSTRAINT "venues_submittedById_fk" FOREIGN KEY ("submittedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "community_claims_status_idx" ON "community_claims" USING btree ("status");
CREATE INDEX "community_followers_userId_idx" ON "community_followers" USING btree ("userId");
CREATE INDEX "date_polls_communityId_idx" ON "date_polls" USING btree ("communityId");
CREATE INDEX "email_deliveries_queue_idx" ON "email_deliveries" USING btree ("status","nextAttemptAt");
CREATE INDEX "event_hosts_communityId_idx" ON "event_hosts" USING btree ("communityId");
CREATE INDEX "event_publications_nextAttemptAt_idx" ON "event_publications" USING btree ("nextAttemptAt");
CREATE INDEX "venue_requests_venueId_status_idx" ON "venue_requests" USING btree ("venueId","status");
CREATE INDEX "venue_requests_communityId_idx" ON "venue_requests" USING btree ("communityId");
CREATE INDEX "venues_status_idx" ON "venues" USING btree ("status");
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "open_spaces" ADD CONSTRAINT "open_spaces_publishById_fk" FOREIGN KEY ("publishById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "open_spaces" ADD CONSTRAINT "open_spaces_venueId_fk" FOREIGN KEY ("venueId") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "open_spaces_status_startDate_idx" ON "open_spaces" USING btree ("status","startDate");
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_eventId_userId_key" UNIQUE("eventId","userId");

COMMIT;
```

## 3. Check for drift

`pnpm db:push` (strict, it asks before applying) must list **only** this churn, which
`drizzle-kit` shows on every push and is safe to skip or apply:

- `survey_responses_one` dropped and created again.
- `owy_stage_state.desk` default set again.
- The `'{}'` defaults of `communities.topics`, `communities.feedNames`, `open_spaces.topics`,
  `open_spaces.needs`, `date_polls.invited` and `venues.amenities` set again.

Anything else means production differs from the schema: stop and compare
`information_schema.columns` (name, type, `is_nullable`, `column_default`) with a local push.

## 4. Load the directory

The communities move from Keystatic to the database:

```sh
DATABASE_URL=… pnpm db:import-communities --dry-run   # prints what it would change
DATABASE_URL=… pnpm db:import-communities
```

It upserts by slug and only fills empty fields, so running it twice is safe. Check that
`/comunidades` shows every community on the Neon branch's preview before running it on production.

## 5. Environment

| Variable                                                                                                      | What for                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORGANIZAR_SECRET`                                                                                            | Signs the links in emails (tickets, host answers, unsubscribe, door)                                                                                        |
| `INTEGRATIONS_SECRET`                                                                                         | Encrypts Eventbrite tokens. Set it before anyone connects: rotating it later makes stored tokens unreadable                                                 |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                                | Sending email (Resend, through the Vercel Marketplace)                                                                                                      |
| `EMAIL_FROM_NEWS`                                                                                             | Optional: the sender for new-event emails to followers, on its own subdomain (`news.owu.uy`), so bulk mail never hurts the reputation sign-in codes rely on |
| `EMAIL_DAILY_CAP`                                                                                             | Optional: the plan's daily limit; past 80 % only urgent email goes out                                                                                      |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `QSTASH_TOKEN`                                       | The 5-minute tick; then run `pnpm jobs:schedule` once                                                                                                       |
| `TELEGRAM_BOT_TOKEN`, `OWY_ANNOUNCE_TELEGRAM_CHAT_ID`, `OWY_SLACK_BOT_TOKEN`, `OWY_ANNOUNCE_SLACK_CHANNEL_ID` | Already set for Owy: organizers can have it announce their events there                                                                                     |
| `CRON_SECRET`                                                                                                 | The daily Vercel cron (backstop and retention)                                                                                                              |
| `EVENTBRITE_CLIENT_ID`, `EVENTBRITE_CLIENT_SECRET`                                                            | The Eventbrite app, with redirect `https://www.owu.uy/api/integrations/eventbrite/callback`                                                                 |
| `NEXT_PUBLIC_FLAG_ORGANIZAR`                                                                                  | Shows the entry points (the CTA on `/organizar`, Seguir, claims). Leave it off until launch                                                                 |

Preview deployments need a non-production `DATABASE_URL` (a Neon branch): `/comunidades` now
reads the database at build time.

## 6. Later

- One release after the directory is verified in production, delete the Keystatic communities
  YAML (`content/communities/`).
- Create the `privacidad@owu.uy` alias that `/privacidad` points to, and register the database
  with the URCDP.
