/* eslint-disable no-console */
/**
 * Checks the /timeline dataset (content/timeline) after a build, and says what changed since the
 * last commit. Errors (exit 1) are what breaks a page or a published URL:
 * - two events or two people with the same slug; an event in a community that doesn't exist;
 * - an organizer or a speaker linked to a profile that doesn't exist; a team role in a community
 *   that doesn't exist;
 * - a link in story.json, or a slug the code names (the home's photo mosaic, OWU's own photos),
 *   to an event that doesn't exist; a story photo index past the event's photos;
 * - an event or profile URL that was published (in the base commit) and is gone, unless
 *   overrides.json hides it on purpose.
 * Warnings are worth a look but don't break anything.
 *
 * Usage:
 *   pnpm timeline:check [--base <git ref>]   (HEAD by default)
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { TimelineCommunity, TimelineEvent, TimelinePerson } from "../../src/lib/timeline/types";

const OUT = path.resolve("content/timeline");
const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "HEAD";

const readJson = <T>(file: string) => JSON.parse(readFileSync(path.join(OUT, file), "utf8")) as T;
const events = readdirSync(path.join(OUT, "events"))
  .filter((file) => file.endsWith(".json"))
  .flatMap((file) => readJson<TimelineEvent[]>(`events/${file}`));
const communities = new Map(readJson<TimelineCommunity[]>("communities.json").map((c) => [c.slug, c]));
const people = readJson<TimelinePerson[]>("people.json");
const person = new Map(people.map((p) => [p.slug, p]));
const bySlug = new Map(events.map((event) => [event.slug, event]));
const overrides = readJson<{
  hide?: string[];
  hidePhotos?: string[];
  people?: { hide?: string[]; noPhoto?: string[] };
}>("overrides.json");

const errors: string[] = [];
const warnings: string[] = [];

// ---------------------------------------------------------------- the dataset itself

const twice = <T>(values: T[]) => values.filter((value, i) => values.indexOf(value) !== i);
for (const slug of new Set(twice(events.map((event) => event.slug)))) errors.push(`Two events have the slug ${slug}`);
for (const id of new Set(twice(events.map((event) => event.id)))) errors.push(`Two events have the id ${id}`);
for (const slug of new Set(twice(people.map((p) => p.slug)))) errors.push(`Two people have the slug ${slug}`);

for (const event of events) {
  const at = `/timeline/${event.slug}`;
  if (!event.title || !event.start) errors.push(`${at}: no title or date`);
  if (!communities.has(event.community)) errors.push(`${at}: community "${event.community}" doesn't exist`);
  for (const { person: slug, name } of event.organizers ?? [])
    if (!person.has(slug)) errors.push(`${at}: organizer ${name} links to a profile that doesn't exist (${slug})`);
  for (const talk of event.talks ?? [])
    for (const speaker of talk.speakers ?? [])
      if (speaker.person && !person.has(speaker.person))
        errors.push(`${at}: speaker ${speaker.name} links to a profile that doesn't exist (${speaker.person})`);
  const srcs = (event.photos ?? []).map((photo) => photo.src);
  for (const src of new Set(twice(srcs))) warnings.push(`${at}: the same photo twice (${src})`);
  for (const src of srcs)
    if (src.startsWith("http:")) warnings.push(`${at}: a photo over http, blocked on https pages (${src})`);
  if (event.geo && (event.geo[0] > -30 || event.geo[0] < -35.1 || event.geo[1] > -53 || event.geo[1] < -58.6))
    warnings.push(`${at}: pinned outside Uruguay (${event.geo.join(", ")})`);
}
for (const p of people)
  for (const role of p.roles ?? [])
    if (!communities.has(role.community))
      errors.push(`/timeline/personas/${p.slug}: team role in "${role.community}", which doesn't exist`);

// OWU's own photos join their La Meetup editions when the site reads the dataset (OWN_PHOTOS in data.ts)
const ownPhotos = new Set(
  [
    ...readFileSync(path.resolve("src/lib/timeline/data.ts"), "utf8").matchAll(/"(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)": "/g),
  ].map(([, slug]) => slug)
);

// story.json: every link and photo points at an event, and the photo exists
type StoryYear = {
  year: number;
  lines: (string | [string, string])[][];
  photos?: { event: string; n: number }[];
  badges?: string[];
};
for (const year of readJson<StoryYear[]>("story.json")) {
  for (const segment of year.lines.flat())
    if (Array.isArray(segment) && !bySlug.has(segment[1]))
      errors.push(`story.json ${year.year}: "${segment[0]}" links to ${segment[1]}, which doesn't exist`);
  for (const { event, n } of year.photos ?? []) {
    const found = bySlug.get(event);
    if (!found) errors.push(`story.json ${year.year}: photo of ${event}, which doesn't exist`);
    else if (!found.photos?.[n] && !ownPhotos.has(event))
      errors.push(`story.json ${year.year}: ${event} has no photo #${n}`);
  }
  for (const badge of year.badges ?? [])
    if (!communities.has(badge)) errors.push(`story.json ${year.year}: badge "${badge}" isn't a community`);
}
const years = readJson<StoryYear[]>("story.json").map((year) => year.year);
const now = new Date().getFullYear();
if (!years.includes(now)) warnings.push(`story.json has no ${now} yet: the story rail ends at ${Math.max(...years)}`);

// Slugs the code names: the home's mosaic, OWU's own photos
for (const file of ["src/app/(web)/(content)/timeline/page.tsx", "src/lib/timeline/data.ts"]) {
  const source = readFileSync(path.resolve(file), "utf8");
  for (const [, slug] of source.matchAll(/"(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)"/g))
    if (!bySlug.has(slug)) errors.push(`${file} names ${slug}, which doesn't exist`);
}

// Takedowns (overrides.json): each one in effect. A profile is named by slug or Meetup profile URL
const profileOf = (key: string) => people.find((p) => p.slug === key || p.meetup === key);
for (const key of overrides.people?.noPhoto ?? []) {
  const found = profileOf(key);
  if (!found) errors.push(`people.noPhoto "${key}" matches no profile: its slug moved? Name their Meetup profile URL`);
  else if (found.photo) errors.push(`/timeline/personas/${found.slug} still shows a photo (people.noPhoto)`);
}
for (const key of overrides.people?.hide ?? [])
  if (profileOf(key)) errors.push(`/timeline/personas/${profileOf(key)!.slug} is still up (people.hide "${key}")`);
const shown = new Set(events.flatMap((event) => (event.photos ?? []).map((photo) => photo.src)));
for (const src of overrides.hidePhotos ?? []) if (shown.has(src)) errors.push(`A hidden photo still shows: ${src}`);
for (const id of overrides.hide ?? [])
  if (events.some((event) => event.id === id || event.mergedIds?.includes(id)))
    errors.push(`Hidden event ${id} still shows`);

// ---------------------------------------------------------------- what changed since the base

const git = (...command: string[]) => {
  try {
    return execFileSync("git", command, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return null;
  }
};
const baseFiles = git("ls-tree", "--name-only", `${BASE}:content/timeline/events`)?.split("\n").filter(Boolean) ?? [];
const baseEvents = baseFiles.flatMap(
  (file) => JSON.parse(git("show", `${BASE}:content/timeline/events/${file}`) ?? "[]") as TimelineEvent[]
);
const basePeople = JSON.parse(git("show", `${BASE}:content/timeline/people.json`) ?? "[]") as TimelinePerson[];
const hidden = new Set([...(overrides.hide ?? []), ...(overrides.people?.hide ?? [])]);

if (!baseEvents.length) warnings.push(`No published dataset at ${BASE} to compare with`);
const ids = new Set(events.flatMap((event) => [event.id, ...(event.mergedIds ?? [])]));
for (const old of baseEvents) {
  if (bySlug.has(old.slug)) continue;
  const intended = hidden.has(old.id) || hidden.has(old.slug);
  const moved = events.find((event) => event.id === old.id || event.mergedIds?.includes(old.id));
  const message = `/timeline/${old.slug} was published and is gone${moved ? ` (now /timeline/${moved.slug})` : ids.has(old.id) ? "" : " (its event is no longer in the sources)"}`;
  (intended ? warnings : errors).push(intended ? `${message}: hidden in overrides.json` : message);
}
for (const old of basePeople)
  if (!person.has(old.slug)) {
    const message = `/timeline/personas/${old.slug} (${old.name}) was published and is gone`;
    // The same Meetup account under a new name (they renamed it): the profile moved
    const moved = old.meetup ? people.find((p) => p.meetup === old.meetup) : undefined;
    if (hidden.has(old.slug) || (old.meetup && hidden.has(old.meetup)))
      warnings.push(`${message}: hidden in overrides.json`);
    else if (moved)
      warnings.push(`${message}: now /timeline/personas/${moved.slug} (${moved.name}, same Meetup account)`);
    else errors.push(message);
  }

const baseSlugs = new Set(baseEvents.map((event) => event.slug));
const added = events.filter((event) => !baseSlugs.has(event.slug));
const photos = (list: TimelineEvent[]) => list.reduce((sum, event) => sum + (event.photos?.length ?? 0), 0);
const basePersons = new Set(basePeople.map((p) => p.slug));

const takedowns = [overrides.people?.hide, overrides.people?.noPhoto, overrides.hidePhotos, overrides.hide].map(
  (list) => list?.length ?? 0
);
if (takedowns.some(Boolean))
  console.log(
    `Takedowns in effect: ${takedowns[0]} profiles hidden, ${takedowns[1]} profile photos off, ${takedowns[2]} photos hidden, ${takedowns[3]} events hidden`
  );
console.log(
  `Dataset: ${events.length} events · ${communities.size} communities · ${people.length} people · ${photos(events)} photos`
);
if (baseEvents.length)
  console.log(
    `Since ${BASE}: ${added.length} new events · ${people.filter((p) => !basePersons.has(p.slug)).length} new people · ${photos(events) - photos(baseEvents)} photos (net)`
  );
for (const event of added.slice(0, 40))
  console.log(`  + ${event.start.slice(0, 10)} ${event.title} (${communities.get(event.community)?.name})`);
if (added.length > 40) console.log(`  … and ${added.length - 40} more`);

if (warnings.length) console.log(`\n${warnings.length} warnings:\n${warnings.map((line) => `  - ${line}`).join("\n")}`);
if (errors.length) {
  console.log(`\n${errors.length} errors:\n${errors.map((line) => `  - ${line}`).join("\n")}`);
  process.exitCode = 1;
} else console.log("\nNo errors.");
