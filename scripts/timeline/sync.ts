/* eslint-disable no-console */
/**
 * Brings the timeline's Meetup sources (scripts/timeline/sources/meetup) up to date. For every live
 * group: its new and recent events (with their album photos and hosts), whether it's still alive
 * (or renamed, or gone), its team, its size and rating. Then every host's and team member's name,
 * profile and photo, as Meetup shows them today. Groups that are gone keep what was harvested.
 * Read-only on Meetup's side: its public GraphQL (api.meetup.com/gql-ext and, for albums,
 * www.meetup.com/gql2), no login, one request at a time.
 *
 * Usage:
 *   pnpm timeline:sync                          every live group, from 180 days before its latest event
 *   pnpm timeline:sync --group <urlname> [--full]  one group (--full: all its events)
 *   pnpm timeline:sync --discover               also list Uruguay groups on Meetup that aren't in the sources
 *   pnpm timeline:sync --add <urlname>=<tech|borderline|no> [--add …]
 *                                               list new groups: "tech" and "borderline" get all their events
 *                                               ("borderline" lands in the ecosystem layer), "no" is only
 *                                               remembered so --discover stops listing it
 *
 * Then: pnpm timeline:build, pnpm timeline:photos, pnpm timeline:check.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "sources/meetup");
const args = process.argv.slice(2);
const values = (flag: string) => args.flatMap((arg, i) => (arg === flag && args[i + 1] ? [args[i + 1]] : []));
const FULL = args.includes("--full");
const DISCOVER = args.includes("--discover");
const ONLY = values("--group").map((urlname) => urlname.toLowerCase());
const ADD = values("--add").map((entry) => {
  const [urlname, flag] = entry.split("=");
  if (!urlname || !["tech", "borderline", "no"].includes(flag)) {
    console.error(`--add ${entry}: expected <urlname>=tech|borderline|no`);
    process.exit(1);
  }
  return { urlname, flag: flag as "tech" | "borderline" | "no" };
});

// ---------------------------------------------------------------- sources

type Photo = { highResUrl: string; isGroupDefault?: boolean };
type SourceEvent = {
  id: string;
  group: string;
  title: string;
  dateTime: string;
  endTime?: string;
  status: string;
  eventType: string;
  eventUrl: string;
  waybackUrl?: string;
  venue?: { name?: string; city?: string; country?: string; lat?: number; lon?: number };
  rsvps?: number;
  featuredPhoto?: Photo;
  displayPhoto?: Photo;
  photoAlbum?: { photoCount: number; photos: string[] };
  hosts?: { id: string; name: string }[];
  description?: string;
};
type SourceGroup = {
  id?: string;
  urlname: string;
  currentUrlname?: string;
  requestedAs?: string[];
  name: string;
  status?: string;
  activity: "active" | "dormant" | "dead";
  flag?: { tech: "tech" | "borderline" | "no"; name?: string; note?: string };
  link?: string;
  foundedDate?: string;
  members?: number;
  pastEvents: number;
  lastEvent?: string;
};
type People = {
  members: Record<string, { name: string; url?: string; photo?: string }>;
  leaders: Record<string, { id: string; role: string }[]>;
};
type Stats = Record<string, { members: number | null; rating: number | null; ratings: number }>;

const read = <T>(file: string) => JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as T;
// One record per line: a sync's diff shows what changed, event by event
const lines = (rows: unknown[]) => `[\n${rows.map((row) => JSON.stringify(row)).join(",\n")}\n]\n`;
const entries = (record: Record<string, unknown>) =>
  `{\n${Object.entries(record)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(",\n")}\n}\n`;
/** Without the keys a source doesn't have, so a record only changes when the source does */
const compact = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;

const groups = read<SourceGroup[]>("groups.json");
const events = new Map(read<SourceEvent[]>("events.json").map((event) => [event.id, event]));
const people = read<People>("people.json");
const stats = read<Stats>("group-stats.json");
const before = new Map([...events].map(([id, event]) => [id, JSON.stringify(event)]));

// ---------------------------------------------------------------- Meetup

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Meetup asks for no particular rate; 400 ms between requests, one at a time, never got a 429
// in the harvest (~6,000 requests). Retries back off from 3 s, doubling, six times (~3 minutes).
const DELAY = 400;
const TRIES = 6;

type Response<T> = { data?: T; errors?: { message: string }[] };
async function post<T>(url: string, query: string, variables: Record<string, unknown> = {}) {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    await sleep(DELAY);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "owu.uy timeline sync (read-only)" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(60_000),
    }).catch((error: Error) => error);
    if (response instanceof Error || response.status === 429 || response.status >= 500) {
      const wait =
        (response instanceof Error ? 0 : Number(response.headers.get("retry-after")) * 1000) || 3000 * 2 ** attempt;
      console.warn(
        `  ${response instanceof Error ? response.message : `HTTP ${response.status}`}, retrying in ${wait / 1000}s`
      );
      await sleep(wait);
      continue;
    }
    const json = (await response.json()) as Response<T>;
    if (json.errors?.length && !json.data) throw new Error(`Meetup: ${json.errors.map((e) => e.message).join("; ")}`);
    return json.data!;
  }
  throw new Error(`Meetup didn't answer after ${TRIES} tries: ${url}`);
}
const gql = <T>(query: string, variables?: Record<string, unknown>) =>
  post<T>("https://api.meetup.com/gql-ext", query, variables);

const EVENT = `id title dateTime endTime eventUrl status eventType description
  rsvps{ totalCount } featuredEventPhoto{ id highResUrl } displayPhoto{ id highResUrl }
  photoAlbum{ photoCount } venues{ name city country lat lon } eventHosts{ name member{ id } }`;
const MEMBER = "id name memberUrl memberPhoto{ highResUrl }";
type EventNode = {
  id: string;
  title: string;
  dateTime: string;
  endTime?: string;
  eventUrl: string;
  status: string;
  eventType: string;
  description?: string;
  rsvps?: { totalCount: number };
  featuredEventPhoto?: { id: string; highResUrl: string };
  displayPhoto?: { id: string; highResUrl: string };
  photoAlbum?: { photoCount: number };
  venues?: { name?: string; city?: string; country?: string; lat?: number; lon?: number }[];
  eventHosts?: { name?: string; member?: { id: string } }[];
};
type MemberNode = { id: string; name: string; memberUrl?: string; memberPhoto?: { highResUrl: string } };
type Connection<T> = { pageInfo?: { hasNextPage: boolean; endCursor: string }; edges: { node: T }[] };
type GroupNode = {
  id: string;
  urlname: string;
  name: string;
  status: string;
  link: string;
  foundedDate: string;
  stats?: { memberCounts?: { all: number }; eventRatings?: { average: number; totalRatings: number } };
  memberships?: { edges: { node: MemberNode; metadata: { role: string } }[] };
  past?: Connection<EventNode>;
  upcoming?: Connection<EventNode>;
};

// A group's team, size and rating, and a page of its past events (from `since`) plus the upcoming ones
const groupQuery = (since: string | null) => `query($u: String!, $after: String) {
  groupByUrlname(urlname: $u) {
    id urlname name status link foundedDate
    stats { memberCounts { all } eventRatings { average totalRatings } }
    memberships(first: 50, filter: { status: [LEADER] }) { edges { node { ${MEMBER} } metadata { role } } }
    past: events(status: PAST, sort: ASC, first: 50, after: $after${since ? `, filter: { afterDateTime: "${since}" }` : ""}) {
      pageInfo { hasNextPage endCursor } edges { node { ${EVENT} } }
    }
    upcoming: events(status: ACTIVE, sort: ASC, first: 50) { edges { node { ${EVENT} } } }
  }
}`;

// ---------------------------------------------------------------- per group

const report = {
  added: [] as string[],
  changed: 0,
  removed: [] as string[],
  renamed: [] as string[],
  died: [] as string[],
  unreachable: [] as string[],
  albums: 0,
  photos: 0,
};
const hostNames = new Map<string, string>();
for (const event of events.values()) for (const host of event.hosts ?? []) hostNames.set(host.id, host.name);

const photoOf = (photo?: { highResUrl: string }) => (photo?.highResUrl ? { highResUrl: photo.highResUrl } : undefined);
/** A host whose name came back empty has it on another event */
function hostsOf(node: EventNode) {
  const hosts = (node.eventHosts ?? [])
    .flatMap((host) => {
      const id = host.member?.id;
      const name = host.name || (id ? hostNames.get(id) : undefined);
      return id && name ? [{ id, name }] : [];
    })
    .filter((host, i, all) => all.findIndex((other) => other.id === host.id) === i);
  return hosts.length ? hosts : undefined;
}

/** Albums to list again: new, or their count changed (Meetup's count includes photos it no longer serves) */
const albumsToList = new Set<string>();
function toEvent(node: EventNode, group: string): SourceEvent {
  const previous = events.get(node.id);
  const venue = node.venues?.[0];
  const count = node.photoAlbum?.photoCount ?? 0;
  if (count && (count !== previous?.photoAlbum?.photoCount || !previous.photoAlbum.photos.length))
    albumsToList.add(node.id);
  return compact({
    id: node.id,
    group,
    title: node.title,
    dateTime: node.dateTime,
    endTime: node.endTime,
    status: node.status,
    eventType: node.eventType,
    eventUrl: node.eventUrl,
    waybackUrl: previous?.waybackUrl,
    venue: venue
      ? compact({ name: venue.name, city: venue.city, country: venue.country, lat: venue.lat, lon: venue.lon })
      : undefined,
    rsvps: node.rsvps?.totalCount || undefined,
    featuredPhoto: photoOf(node.featuredEventPhoto),
    displayPhoto: node.displayPhoto?.id !== node.featuredEventPhoto?.id ? photoOf(node.displayPhoto) : undefined,
    // The album's photos are listed below, once its count says it changed
    photoAlbum: node.photoAlbum?.photoCount
      ? { photoCount: node.photoAlbum.photoCount, photos: previous?.photoAlbum?.photos ?? [] }
      : undefined,
    hosts: hostsOf(node),
    description: node.description,
  });
}

/** The group's image reused as most events' image is the group's, not the event's */
function markGroupDefaults(group: string) {
  const own = [...events.values()].filter((event) => event.group === group);
  const uses = new Map<string, number>();
  for (const event of own)
    if (event.displayPhoto) uses.set(event.displayPhoto.highResUrl, (uses.get(event.displayPhoto.highResUrl) ?? 0) + 1);
  for (const event of own)
    if (event.displayPhoto) {
      // Used on three events or more: a default image, not a flyer
      if ((uses.get(event.displayPhoto.highResUrl) ?? 0) > 2) event.displayPhoto.isGroupDefault = true;
      else delete event.displayPhoto.isGroupDefault;
    }
}

// How far back a sync looks: an album, a final RSVP count or a corrected title arrives weeks after the
// event; half a year covers what organizers fix afterwards without asking for a group's whole history
const LOOKBACK_DAYS = 180;
const DAY = 86_400_000;
// A group with no event in a year is dormant, as the history counts it
const ACTIVE_DAYS = 365;

async function syncGroup(group: SourceGroup, full: boolean) {
  const urlname = group.currentUrlname ?? group.urlname;
  const own = [...events.values()].filter((event) => event.group === group.urlname);
  const latest = own.filter((event) => event.status === "PAST").at(-1)?.dateTime;
  const since = full || !latest ? null : new Date(new Date(latest).getTime() - LOOKBACK_DAYS * DAY).toISOString();

  let node: GroupNode | null = null;
  const fetched: EventNode[] = [];
  let after: string | null = null;
  do {
    const page: { groupByUrlname: GroupNode | null } = await gql(groupQuery(since), { u: urlname, after });
    node = page.groupByUrlname;
    if (!node) break;
    fetched.push(...(node.past?.edges.map((edge) => edge.node) ?? []));
    if (!after) fetched.push(...(node.upcoming?.edges.map((edge) => edge.node) ?? []));
    after = node.past?.pageInfo?.hasNextPage ? node.past.pageInfo.endCursor : null;
  } while (after);

  if (!node) {
    // Renamed (Meetup answers under the new urlname) or gone: ask through one of its events
    const probe = own.at(-1)?.id;
    const found = probe
      ? await gql<{ event: { group: { urlname: string; status: string } | null } | null }>(
          `query($id: ID!) { event(id: $id) { group { urlname status } } }`,
          { id: probe }
        )
      : null;
    const now = found?.event?.group;
    if (now && ["PAID", "GRACE"].includes(now.status) && now.urlname.toLowerCase() !== urlname.toLowerCase()) {
      console.log(`  ${urlname} is now ${now.urlname}`);
      report.renamed.push(`${urlname} → ${now.urlname}`);
      group.currentUrlname = now.urlname;
      return syncGroup(group, full);
    }
    if (now) {
      // Its events stay; their pages on Meetup don't, so they point at the Wayback Machine
      console.log(`  ${urlname}: gone (${now.status})`);
      report.died.push(urlname);
      group.activity = "dead";
      group.status = now.status;
      for (const event of own)
        event.waybackUrl ??= `https://web.archive.org/web/*/meetup.com/${group.urlname}/events/${event.id}*`;
      delete stats[group.urlname];
      delete people.leaders[group.urlname];
      return;
    }
    console.warn(`  ${urlname}: Meetup doesn't answer for it, kept as it was`);
    report.unreachable.push(urlname);
    return;
  }

  for (const event of fetched) {
    const next = toEvent(event, group.urlname);
    if (!events.has(next.id)) report.added.push(`${group.urlname}: ${next.dateTime.slice(0, 10)} ${next.title}`);
    events.set(next.id, next);
  }
  // Announced before and neither upcoming nor past now: cancelled, or deleted
  const seen = new Set(fetched.map((event) => event.id));
  for (const event of own.filter((event) => event.status !== "PAST" && !seen.has(event.id))) {
    const now = await gql<{ event: { status: string } | null }>(`query($id: ID!) { event(id: $id) { status } }`, {
      id: event.id,
    });
    if (now.event?.status === "PAST") continue;
    events.delete(event.id);
    report.removed.push(
      `${group.urlname}: ${event.dateTime.slice(0, 10)} ${event.title} (${now.event?.status ?? "deleted"})`
    );
  }
  markGroupDefaults(group.urlname);

  const all = [...events.values()].filter((event) => event.group === group.urlname);
  const past = all.filter((event) => event.status === "PAST");
  const upcoming = all.some((event) => event.status !== "PAST");
  group.id = node.id;
  group.status = node.status;
  group.link = node.link;
  group.foundedDate = node.foundedDate;
  group.members = node.stats?.memberCounts?.all ?? group.members;
  group.pastEvents = past.length;
  group.lastEvent = past.at(-1)?.dateTime;
  group.activity =
    upcoming || (group.lastEvent && Date.now() - new Date(group.lastEvent).getTime() < ACTIVE_DAYS * DAY)
      ? "active"
      : "dormant";
  if (node.urlname.toLowerCase() !== group.urlname.toLowerCase()) group.currentUrlname = node.urlname;

  const ratings = node.stats?.eventRatings;
  stats[group.urlname] = {
    members: node.stats?.memberCounts?.all ?? null,
    rating: ratings?.totalRatings ? Math.round(ratings.average * 100) / 100 : null,
    ratings: ratings?.totalRatings ?? 0,
  };
  const team = node.memberships?.edges ?? [];
  for (const { node: member } of team) keepMember(member);
  people.leaders[group.urlname] = team.map(({ node: member, metadata }) => ({ id: member.id, role: metadata.role }));
  console.log(
    `  ${group.urlname}: ${fetched.length} events since ${since?.slice(0, 10) ?? "the start"}, ${team.length} in its team`
  );
}

function keepMember(member: MemberNode | null | undefined) {
  if (!member?.id || !member.name) return;
  people.members[member.id] = compact({
    name: member.name,
    url: member.memberUrl,
    photo: member.memberPhoto?.highResUrl,
  });
}

// ---------------------------------------------------------------- run

for (const { urlname, flag } of ADD) {
  if (
    groups.some((group) =>
      [group.urlname, group.currentUrlname].some((name) => name?.toLowerCase() === urlname.toLowerCase())
    )
  ) {
    console.log(`${urlname} is already in the sources`);
    continue;
  }
  const found = await gql<{ groupByUrlname: { urlname: string; name: string } | null }>(
    `query($u: String!) { groupByUrlname(urlname: $u) { urlname name } }`,
    { u: urlname }
  );
  if (!found.groupByUrlname) {
    console.error(`${urlname}: no such group on Meetup`);
    process.exitCode = 1;
    continue;
  }
  groups.push({
    urlname: found.groupByUrlname.urlname,
    name: found.groupByUrlname.name,
    activity: flag === "no" ? "dormant" : "active",
    flag: { tech: flag },
    pastEvents: 0,
  });
  console.log(`added ${found.groupByUrlname.urlname} (${found.groupByUrlname.name}) as ${flag}`);
}

const added = new Set(ADD.map(({ urlname }) => urlname.toLowerCase()));
// The groups asked for; when only adding, just the new ones
const only = ONLY.length ? ONLY : [...added];
const targets = groups.filter(
  (group) =>
    group.activity !== "dead" &&
    group.flag?.tech !== "no" &&
    (!only.length || [group.urlname, group.currentUrlname].some((name) => name && only.includes(name.toLowerCase())))
);
console.log(`Syncing ${targets.length} groups`);
for (const group of targets) {
  // A group just added has no history here yet: all of it
  const isNew = added.has(group.urlname.toLowerCase()) || !group.pastEvents;
  try {
    await syncGroup(group, FULL || isNew);
  } catch (error) {
    console.warn(`  ${group.urlname}: ${(error as Error).message}`);
    report.unreachable.push(group.urlname);
  }
}

// Album photos, for albums that grew (www.meetup.com/gql2 lists an album's photos; gql-ext doesn't)
const albums = [...albumsToList].flatMap((id) => (events.get(id)?.photoAlbum ? [events.get(id)!] : []));
// Eight albums a request keeps each response well under a megabyte
const ALBUMS_PER_REQUEST = 8;
for (let i = 0; i < albums.length; i += ALBUMS_PER_REQUEST) {
  const batch = albums.slice(i, i + ALBUMS_PER_REQUEST);
  // photoSample(number) returns the whole album when asked for more than it holds
  const query = `{ ${batch
    .map(
      (event, j) =>
        `e${j}: event(id: "${event.id}") { photoAlbum { photoCount photoSample(number: ${event.photoAlbum!.photoCount + 20}) { highResUrl } } }`
    )
    .join(" ")} }`;
  try {
    const data = await post<
      Record<string, { photoAlbum: { photoCount: number; photoSample: { highResUrl: string }[] } | null } | null>
    >("https://www.meetup.com/gql2", query);
    batch.forEach((event, j) => {
      const album = data[`e${j}`]?.photoAlbum;
      if (!album) return;
      const added = album.photoSample.length - event.photoAlbum!.photos.length;
      if (added) report.albums++;
      report.photos += added;
      event.photoAlbum = { photoCount: album.photoCount, photos: album.photoSample.map((photo) => photo.highResUrl) };
    });
  } catch (error) {
    console.warn(`  albums: ${(error as Error).message}`);
  }
}

// Every host's name, profile and photo as Meetup shows them today (people change their photo, and
// the old file goes away), asked through the latest event they hosted: gql-ext has no member(id)
const latestHosted = new Map<string, string>();
for (const event of [...events.values()].sort((a, b) => a.dateTime.localeCompare(b.dateTime)))
  for (const host of event.hosts ?? []) latestHosted.set(host.id, event.id);
const asked = [...new Set(latestHosted.values())];
// Forty aliases a request: Meetup's query cost limit allows about fifty
const EVENTS_PER_REQUEST = 40;
for (let i = 0; i < asked.length; i += EVENTS_PER_REQUEST) {
  const chunk = asked.slice(i, i + EVENTS_PER_REQUEST);
  try {
    const data = await gql<Record<string, { eventHosts?: { member?: MemberNode }[] } | null>>(
      `{ ${chunk.map((id, j) => `e${j}: event(id: "${id}") { eventHosts { member { ${MEMBER} } } }`).join(" ")} }`
    );
    chunk.forEach((_, j) => data[`e${j}`]?.eventHosts?.forEach((host) => keepMember(host.member)));
  } catch (error) {
    console.warn(`  hosts: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------- discover

type Candidate = {
  urlname: string;
  name: string;
  city?: string;
  members?: number;
  foundedDate?: string;
  topic?: string;
};
const candidates = new Map<string, Candidate>();
if (DISCOVER) {
  // What a Uruguay tech group calls itself, searched around Montevideo and the whole country
  const QUERIES =
    `tech,tecnología,developers,desarrolladores,programación,programming,software,javascript,python,java,.net,php,ruby,go,rust,elixir,react,angular,frontend,web,mobile,android,ios,flutter,data,data science,machine learning,ai,inteligencia artificial,llm,cloud,aws,azure,google,gdg,devops,kubernetes,security,ciberseguridad,owasp,blockchain,web3,agile,scrum,testing,qa,ux,diseño,product,startups,emprendedores,gaming,videojuegos,hardware,maker,open source,linux,women in tech,mujeres,hackathon,tech talks,comunidad`.split(
      ","
    );
  const PLACES = [
    { lat: -34.9, lon: -56.16, radius: 60 },
    { lat: -32.8, lon: -56, radius: 300, country: "uy" },
  ];
  const known = new Set(
    groups.flatMap((group) =>
      [group.urlname, group.currentUrlname, ...(group.requestedAs ?? [])].flatMap((n) => (n ? [n.toLowerCase()] : []))
    )
  );
  for (const place of PLACES)
    for (const query of QUERIES) {
      try {
        const data = await gql<{
          groupSearch: {
            edges: {
              node: {
                urlname: string;
                name: string;
                city?: string;
                country?: string;
                foundedDate?: string;
                stats?: { memberCounts?: { all: number } };
                topicCategory?: { name: string };
              };
            }[];
          } | null;
        }>(
          `query($f: GroupSearchFilter!) { groupSearch(filter: $f, first: 50) { edges { node { urlname name city country foundedDate stats { memberCounts { all } } topicCategory { name } } } } }`,
          { f: { query, ...place } }
        );
        for (const { node } of data.groupSearch?.edges ?? []) {
          if (node.country !== "uy" || known.has(node.urlname.toLowerCase())) continue;
          candidates.set(node.urlname.toLowerCase(), {
            urlname: node.urlname,
            name: node.name,
            city: node.city,
            members: node.stats?.memberCounts?.all,
            foundedDate: node.foundedDate?.slice(0, 10),
            topic: node.topicCategory?.name,
          });
        }
      } catch (error) {
        console.warn(`  search "${query}": ${(error as Error).message}`);
      }
    }
}

// ---------------------------------------------------------------- write

writeFileSync(path.join(DIR, "groups.json"), lines(groups));
writeFileSync(
  path.join(DIR, "events.json"),
  lines([...events.values()].sort((a, b) => a.dateTime.localeCompare(b.dateTime) || a.id.localeCompare(b.id)))
);
writeFileSync(
  path.join(DIR, "people.json"),
  `{\n"members": ${entries(people.members).trimEnd()},\n"leaders": ${entries(people.leaders).trimEnd()}\n}\n`
);
writeFileSync(path.join(DIR, "group-stats.json"), entries(stats));

for (const [id, event] of events) if (before.has(id) && before.get(id) !== JSON.stringify(event)) report.changed++;
console.log("\nSync done:");
console.log(
  `  ${report.added.length} new events, ${report.changed} updated, ${report.removed.length} cancelled or deleted`
);
console.log(
  `  ${report.albums} albums changed (${report.photos} photos net); ${Object.keys(people.members).length} people on file`
);
for (const [label, list] of [
  ["New", report.added],
  ["Removed", report.removed],
  ["Renamed groups", report.renamed],
  ["Groups gone from Meetup (now in the Wayback Machine)", report.died],
  ["Groups Meetup didn't answer for (kept as they were)", report.unreachable],
] as const)
  if (list.length) console.log(`\n${label}:\n${list.map((line) => `  - ${line}`).join("\n")}`);
if (DISCOVER) {
  const found = [...candidates.values()].sort((a, b) => (b.members ?? 0) - (a.members ?? 0));
  console.log(`\nUruguay groups on Meetup not in the sources (${found.length}), biggest first:`);
  for (const group of found)
    console.log(
      `  - ${group.urlname} · ${group.name} · ${group.members ?? "?"} members · ${group.city ?? "?"} · since ${group.foundedDate ?? "?"} · ${group.topic ?? "no category"}`
    );
  console.log("Classify each, then: pnpm timeline:sync --add <urlname>=tech|borderline|no");
}
