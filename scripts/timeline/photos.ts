/* eslint-disable no-console */
/**
 * Checks that every picture the timeline shows still loads from where it's published: event
 * photos, profile photos and the thumbnails of talks' YouTube videos (a video taken down leaves
 * its thumbnail gone too). Nothing is downloaded: one HEAD request each (a tiny GET where HEAD
 * isn't allowed).
 *
 * A picture that's gone (403/404/410, an HTML page where an image should be, Flickr's
 * "photo unavailable") is checked again before it's written to content/timeline/broken-photos.json,
 * which the build reads: those photos drop out of their events and profiles, and those videos out
 * of their talks. Timeouts and server errors say nothing about the picture: never listed. Pictures
 * listed before are checked again, and leave the list when they load.
 *
 * Usage:
 *   pnpm timeline:photos            everything (~8,500 requests, a few minutes)
 *   pnpm timeline:photos --sample 400  a random sample plus everything listed as broken
 *
 * Then: pnpm timeline:build, when the list changed.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { youtubeId } from "../../src/lib/timeline/image";
import type { TimelineEvent, TimelinePerson } from "../../src/lib/timeline/types";

const OUT = path.resolve("content/timeline");
const LIST = path.join(OUT, "broken-photos.json");
const args = process.argv.slice(2);
const sample = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : 0;

type Broken = Record<string, { status: string; since: string; where: string }>;
const listed: Broken = JSON.parse(readFileSync(LIST, "utf8")) as Broken;

// Every picture, with where it shows (for the report)
const where = new Map<string, string>();
const events = readdirSync(path.join(OUT, "events")).flatMap(
  (file) => JSON.parse(readFileSync(path.join(OUT, "events", file), "utf8")) as TimelineEvent[]
);
for (const event of events) {
  for (const photo of event.photos ?? [])
    if (/^https?:/.test(photo.src)) where.set(photo.src, `/timeline/${event.slug}`);
  for (const talk of event.talks ?? []) {
    const id = talk.video ? youtubeId(talk.video) : null;
    // The talk's video is what's listed: the build drops it from the talk
    if (id) where.set(talk.video!, `/timeline/${event.slug} (video of "${talk.title}")`);
  }
}
const people = JSON.parse(readFileSync(path.join(OUT, "people.json"), "utf8")) as TimelinePerson[];
for (const person of people) if (person.photo) where.set(person.photo, `/timeline/personas/${person.slug}`);
// What was listed is checked again even though the build already took it out
for (const [src, entry] of Object.entries(listed)) if (!where.has(src)) where.set(src, entry.where);

let urls = [...where.keys()];
if (sample) urls = [...urls.sort(() => Math.random() - 0.5).slice(0, sample), ...Object.keys(listed)];
urls = [...new Set(urls)];

/** What to ask for: a YouTube video by its thumbnail */
const target = (src: string) => {
  const id = /youtu\.?be/.test(src) ? youtubeId(src) : null;
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : src;
};

type Result = "ok" | "gone" | "unknown";
// Twenty seconds: the Wayback Machine takes ten for some captures; past that it's down, not gone
const TIMEOUT = 20_000;
async function check(src: string): Promise<[Result, string]> {
  const url = target(src);
  const ask = (method: "HEAD" | "GET") =>
    fetch(url, {
      method,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (owu.uy timeline photo check)",
        ...(method === "GET" ? { range: "bytes=0-0" } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });
  try {
    let response = await ask("HEAD");
    // Some servers don't answer HEAD (405), or refuse it where GET works
    if ([403, 405, 501].includes(response.status) && !url.includes("meetupstatic.com")) response = await ask("GET");
    await response.body?.cancel();
    const type = response.headers.get("content-type") ?? "";
    if (response.url.includes("photo_unavailable")) return ["gone", "Flickr: photo unavailable"];
    if ([403, 404, 410].includes(response.status)) return ["gone", String(response.status)];
    if (response.ok && type.startsWith("text/html")) return ["gone", "an HTML page, not an image"];
    if (response.ok) return ["ok", String(response.status)];
    return ["unknown", String(response.status)];
  } catch (error) {
    return ["unknown", (error as Error).name === "TimeoutError" ? "timeout" : (error as Error).message];
  }
}

// How many requests at once to each host: Meetup's and Flickr's CDNs take many, the Wayback
// Machine and small sites few (they slow down or start refusing past that)
const LANES: Record<string, number> = {
  "secure.meetupstatic.com": 12,
  "live.staticflickr.com": 8,
  "i.ytimg.com": 8,
  "raw.githubusercontent.com": 6,
  "web.archive.org": 3,
};
const OTHER_HOSTS = 2;

const results = new Map<string, [Result, string]>();
const byHost = Map.groupBy(urls, (src) => new URL(target(src)).hostname);
let done = 0;
await Promise.all(
  [...byHost].map(async ([host, list]) => {
    const queue = [...list];
    const lane = async () => {
      for (let src = queue.shift(); src; src = queue.shift()) {
        let result = await check(src);
        // Gone once could be a hiccup: gone twice, a few seconds apart, is gone. A timeout or a server
        // error gets a second chance too (the Wayback Machine has bad minutes)
        if (result[0] !== "ok") {
          await new Promise((resolve) => setTimeout(resolve, result[0] === "gone" ? 3000 : 10_000));
          const again = await check(src);
          result = result[0] === "gone" && again[0] === "unknown" ? result : again;
        }
        results.set(src, result);
        if (++done % 500 === 0) console.log(`  ${done}/${urls.length}`);
      }
    };
    await Promise.all(Array.from({ length: LANES[host] ?? OTHER_HOSTS }, lane));
  })
);

const today = new Date().toISOString().slice(0, 10);
const next: Broken = {};
const fresh: string[] = [];
const back: string[] = [];
for (const [src, [result, status]] of results) {
  if (result === "gone") {
    next[src] = listed[src] ?? { status, since: today, where: where.get(src) ?? "" };
    if (!listed[src]) fresh.push(`${src} (${status}) on ${where.get(src)}`);
  } else if (listed[src]) {
    // Loads again, or couldn't tell: listed until it's seen loading
    if (result === "ok") back.push(src);
    else next[src] = listed[src];
  }
}
// What a sample didn't check stays as it was
for (const [src, entry] of Object.entries(listed)) if (!results.has(src)) next[src] = entry;

const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  LIST,
  `{\n${Object.entries(sorted)
    .map(([src, entry]) => `${JSON.stringify(src)}: ${JSON.stringify(entry)}`)
    .join(",\n")}${Object.keys(sorted).length ? "\n" : ""}}\n`
);

const count = (kind: Result) => [...results.values()].filter(([result]) => result === kind).length;
console.log(
  `\nChecked ${results.size} pictures: ${count("ok")} load, ${count("gone")} gone, ${count("unknown")} couldn't tell`
);
const unknownHosts = Map.groupBy(
  [...results].filter(([, [result]]) => result === "unknown"),
  ([src]) => new URL(target(src)).hostname
);
if (unknownHosts.size)
  console.log(
    `Couldn't tell (timeouts, server errors; not listed): ${[...unknownHosts].map(([host, list]) => `${host} ${list.length}`).join(", ")}`
  );
if (fresh.length) console.log(`\nNewly gone (${fresh.length}):\n${fresh.map((line) => `  - ${line}`).join("\n")}`);
if (back.length)
  console.log(`\nLoading again, off the list (${back.length}):\n${back.map((line) => `  - ${line}`).join("\n")}`);
console.log(
  fresh.length || back.length
    ? `\n${LIST.replace(`${process.cwd()}/`, "")} changed: run pnpm timeline:build`
    : "\nNothing changed."
);
