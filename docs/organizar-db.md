# Community site and Organizá database runbook

What #310 (the community-first site, with Organizá merged in) adds to the database, and how to
apply it to production by hand. **Production can't deploy that code until this runs:** pages
built at deploy time read the new columns, so the build fails (and the previous deployment stays
live) until then. Everything is additive: new tables, and new columns that are nullable or have
a default, so the code running in production keeps working before and after.

The repo is `db:push`-driven (no committed migrations). These statements are what
`drizzle-kit push` generates from production's schema (`main` at #313, f15fad9c) to #310's. Checked
on a copy of that schema with rows in it: they apply in one go, the existing events come out as
published with no sign-up (as today), and a push afterwards lists only the known churn below.

**Never run any of this from an agent session. Agustín applies it.**

## 1. Before

- Take a `pg_dump` of production.
- Try everything first on a Neon branch of production (steps 2–5), then on production.
- This includes #310's own tables (`salary_surveys`, `semanario_issues`…), never pushed before.

## 2. Apply the DDL

`lock_timeout` makes a statement give up instead of queueing behind a long query and blocking
the site; if it fails, run it again.

```sql
SET lock_timeout = '3s';
BEGIN;

CREATE TYPE "public"."SalarySurveyStatus" AS ENUM('draft', 'open', 'closed', 'published');
CREATE TYPE "public"."SemanarioStatus" AS ENUM('draft', 'published');
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
CREATE TABLE "salary_survey_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"surveyId" text NOT NULL,
	"participantHash" text NOT NULL,
	CONSTRAINT "salary_survey_participants_surveyId_hash_key" UNIQUE("surveyId","participantHash")
);
CREATE TABLE "salary_survey_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"surveyId" text NOT NULL,
	"role" text NOT NULL,
	"seniority" text NOT NULL,
	"experience" text NOT NULL,
	"stacks" text[] NOT NULL,
	"employer" text NOT NULL,
	"contract" text NOT NULL,
	"modality" text NOT NULL,
	"department" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"hoursPerWeek" integer NOT NULL,
	"satisfaction" integer,
	"gender" text,
	"education" text,
	"createdOn" date DEFAULT now() NOT NULL
);
CREATE TABLE "salary_surveys" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" "SalarySurveyStatus" DEFAULT 'draft' NOT NULL,
	"opensAt" timestamp (3),
	"closesAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "salary_surveys_slug_unique" UNIQUE("slug")
);
CREATE TABLE "semanario_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer,
	"weekStart" date NOT NULL,
	"title" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"sections" jsonb NOT NULL,
	"status" "SemanarioStatus" DEFAULT 'draft' NOT NULL,
	"publishedAt" timestamp (3),
	"reviewedById" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "semanario_issues_number_unique" UNIQUE("number"),
	CONSTRAINT "semanario_issues_weekStart_unique" UNIQUE("weekStart")
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
ALTER TABLE "salary_survey_participants" ADD CONSTRAINT "salary_survey_participants_surveyId_salary_surveys_id_fk" FOREIGN KEY ("surveyId") REFERENCES "public"."salary_surveys"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "salary_survey_responses" ADD CONSTRAINT "salary_survey_responses_surveyId_salary_surveys_id_fk" FOREIGN KEY ("surveyId") REFERENCES "public"."salary_surveys"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "semanario_issues" ADD CONSTRAINT "semanario_issues_reviewedById_user_id_fk" FOREIGN KEY ("reviewedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
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
CREATE INDEX "salary_survey_responses_surveyId_idx" ON "salary_survey_responses" USING btree ("surveyId");
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

## 5. Deploy

Redeploy the failed production deployment on Vercel (or merge anything to `main`).

## 6. Environment

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

## 7. Later

- One release after the directory is verified in production, delete the Keystatic communities
  YAML (`content/communities/`).
- Create the `privacidad@owu.uy` alias that `/privacidad` points to, and register the database
  with the URCDP.

## 8. Organizá v2

What the Organizá v2 release adds, on top of everything above (production at `main` 81840449).
Same rules: additive only (new tables; new columns nullable or with a default), so production
keeps working before and after; **apply it before deploying**, because pages built at deploy time
read the new columns. Generated with `drizzle-kit push --verbose` from `main`'s schema to this
release's on a scratch database, and pushed twice to check that nothing else drifts.

**Never run any of this from an agent session. Agustín applies it.** Same order as before:
`pg_dump`, a Neon branch first (and its preview), then production.

```sql
SET lock_timeout = '3s';
BEGIN;

CREATE TABLE "community_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"communityId" text NOT NULL,
	"platform" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"holderUserId" text,
	"holderName" text DEFAULT '' NOT NULL,
	"backupUserId" text,
	"note" text DEFAULT '' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "community_outreach" (
	"id" text PRIMARY KEY NOT NULL,
	"communityId" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"snoozedUntil" timestamp (3),
	"byId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "event_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"eventId" text NOT NULL,
	"audience" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sendAt" timestamp (3) DEFAULT now() NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"createdById" text,
	"sentAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "speaker_profiles" (
	"userId" text PRIMARY KEY NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"languages" text[] DEFAULT '{"es"}' NOT NULL,
	"formats" text[] DEFAULT '{}' NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mentor" boolean DEFAULT false NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "talk_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"proposalId" text NOT NULL,
	"communityId" text NOT NULL,
	"eventId" text,
	"status" text DEFAULT 'claimed' NOT NULL,
	"claimedById" text,
	"materialsAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "talk_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"speakerUserId" text NOT NULL,
	"speakerName" text NOT NULL,
	"title" text NOT NULL,
	"abstract" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'corta' NOT NULL,
	"level" text DEFAULT 'inicial' NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"firstTime" boolean DEFAULT false NOT NULL,
	"recordingOk" boolean DEFAULT true NOT NULL,
	"communityIds" text[] DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);

CREATE TABLE "talk_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"communityId" text NOT NULL,
	"topic" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"createdById" text,
	"closedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);

ALTER TABLE "survey_responses" DROP CONSTRAINT "survey_responses_one";
ALTER TABLE "communities" ALTER COLUMN "topics" SET DEFAULT '{}';
ALTER TABLE "communities" ALTER COLUMN "feedNames" SET DEFAULT '{}';
ALTER TABLE "date_polls" ALTER COLUMN "invited" SET DEFAULT '{}';
ALTER TABLE "open_spaces" ALTER COLUMN "topics" SET DEFAULT '{}';
ALTER TABLE "open_spaces" ALTER COLUMN "needs" SET DEFAULT '{}';
ALTER TABLE "owy_stage_state" ALTER COLUMN "desk" SET DEFAULT '{"preview":null,"queue":[],"favorites":[]}'::jsonb;
ALTER TABLE "venues" ALTER COLUMN "amenities" SET DEFAULT '{}';
ALTER TABLE "communities" ADD COLUMN "recurringSlot" jsonb;
ALTER TABLE "communities" ADD COLUMN "pausedUntil" date;
ALTER TABLE "communities" ADD COLUMN "noShowNudge" boolean DEFAULT false NOT NULL;
ALTER TABLE "communities" ADD COLUMN "publicStats" boolean DEFAULT false NOT NULL;
ALTER TABLE "attendees" ADD COLUMN "confirmedAt" timestamp (3);
ALTER TABLE "attendees" ADD COLUMN "cancelledAt" timestamp (3);
ALTER TABLE "attendees" ADD COLUMN "excusedAt" timestamp (3);
ALTER TABLE "attendees" ADD COLUMN "volunteerRoles" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "community_claims" ADD COLUMN "proposed" boolean DEFAULT false NOT NULL;
ALTER TABLE "date_polls" ADD COLUMN "closedAt" timestamp (3);
ALTER TABLE "date_polls" ADD COLUMN "deletedAt" timestamp (3);
ALTER TABLE "incidents" ADD COLUMN "reporterContact" text;
ALTER TABLE "incidents" ADD COLUMN "involvesOrganizer" boolean DEFAULT false NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "cancelReason" text DEFAULT '' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "confirmPing" boolean DEFAULT true NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "staleFields" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "volunteerRoles" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "responders" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "open_spaces" ADD COLUMN "closedOutAt" timestamp (3);
ALTER TABLE "open_spaces" ADD COLUMN "hostRecapSentAt" timestamp (3);
ALTER TABLE "open_spaces" ADD COLUMN "copiedFromId" text;
ALTER TABLE "open_spaces" ADD COLUMN "slideNotes" jsonb;
ALTER TABLE "staff_tasks" ADD COLUMN "templateKey" text;
ALTER TABLE "venue_contacts" ADD COLUMN "role" text DEFAULT '' NOT NULL;
ALTER TABLE "venue_contacts" ADD COLUMN "lastConfirmedAt" timestamp (3);
ALTER TABLE "venue_contacts" ADD COLUMN "bouncedAt" timestamp (3);
ALTER TABLE "venue_contacts" ADD COLUMN "leftAt" timestamp (3);
ALTER TABLE "venue_contacts" ADD COLUMN "leftReportedAt" timestamp (3);
ALTER TABLE "venue_requests" ADD COLUMN "counterOptions" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "venue_requests" ADD COLUMN "broadcastId" text;
ALTER TABLE "venue_requests" ADD COLUMN "answeredById" text;
ALTER TABLE "venues" ADD COLUMN "facts" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "community_followers" ADD COLUMN "digest" text DEFAULT 'each' NOT NULL;
ALTER TABLE "community_assets" ADD CONSTRAINT "community_assets_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "community_assets" ADD CONSTRAINT "community_assets_holderUserId_fk" FOREIGN KEY ("holderUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "community_assets" ADD CONSTRAINT "community_assets_backupUserId_fk" FOREIGN KEY ("backupUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "community_outreach" ADD CONSTRAINT "community_outreach_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "community_outreach" ADD CONSTRAINT "community_outreach_byId_fk" FOREIGN KEY ("byId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_eventId_fk" FOREIGN KEY ("eventId") REFERENCES "public"."open_spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "event_messages" ADD CONSTRAINT "event_messages_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "speaker_profiles" ADD CONSTRAINT "speaker_profiles_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "talk_claims" ADD CONSTRAINT "talk_claims_proposalId_fk" FOREIGN KEY ("proposalId") REFERENCES "public"."talk_proposals"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "talk_claims" ADD CONSTRAINT "talk_claims_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "talk_claims" ADD CONSTRAINT "talk_claims_eventId_fk" FOREIGN KEY ("eventId") REFERENCES "public"."open_spaces"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "talk_claims" ADD CONSTRAINT "talk_claims_claimedById_fk" FOREIGN KEY ("claimedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "talk_proposals" ADD CONSTRAINT "talk_proposals_speakerUserId_fk" FOREIGN KEY ("speakerUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "talk_requests" ADD CONSTRAINT "talk_requests_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "talk_requests" ADD CONSTRAINT "talk_requests_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "community_assets_communityId_idx" ON "community_assets" USING btree ("communityId");
CREATE INDEX "community_outreach_communityId_idx" ON "community_outreach" USING btree ("communityId");
CREATE INDEX "event_messages_eventId_idx" ON "event_messages" USING btree ("eventId");
CREATE INDEX "event_messages_status_sendAt_idx" ON "event_messages" USING btree ("status","sendAt");
CREATE UNIQUE INDEX "talk_claims_live_proposalId_key" ON "talk_claims" USING btree ("proposalId") WHERE "talk_claims"."status" in ('claimed', 'scheduled');
CREATE INDEX "talk_claims_communityId_idx" ON "talk_claims" USING btree ("communityId");
CREATE INDEX "talk_proposals_status_idx" ON "talk_proposals" USING btree ("status");
CREATE INDEX "talk_requests_communityId_idx" ON "talk_requests" USING btree ("communityId");
ALTER TABLE "open_spaces" ADD CONSTRAINT "open_spaces_copiedFromId_fk" FOREIGN KEY ("copiedFromId") REFERENCES "public"."open_spaces"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "venue_requests" ADD CONSTRAINT "venue_requests_answeredById_fk" FOREIGN KEY ("answeredById") REFERENCES "public"."venue_contacts"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "venue_requests_broadcastId_idx" ON "venue_requests" USING btree ("broadcastId");

COMMIT;
```

After it, `pnpm db:push` must list only the churn in §3, plus the same `'{}'` default churn on
the new array columns: `open_spaces.staleFields`, `open_spaces.volunteerRoles`,
`open_spaces.responders`, `attendees.volunteerRoles`, `speaker_profiles.topics`,
`speaker_profiles.formats`, `talk_proposals.topics` and `talk_proposals.communityIds`.

No new environment variables. `MEETUP_BOT_URL` exists only to point tests and local runs at a mock
of the meetup-bot feed; production leaves it unset.

Owner actions for this release:

- Decide who receives `conducta@owu.uy` (code-of-conduct reports go there and to each event's
  responders; reports that involve the organization go only there).
- The weekly digest and the T−24 h "¿Seguís viniendo?" ping raise email volume: check the Resend
  plan's daily limit (`EMAIL_DAILY_CAP`) before announcing them.
