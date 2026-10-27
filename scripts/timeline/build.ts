/* eslint-disable no-console */
/**
 * Builds the /timeline dataset (content/timeline/) from its sources (scripts/timeline/sources):
 * meetup.com (groups + every past event, live and deleted groups, kept current by
 * scripts/timeline/sync.ts), GitHub community archives, the conference catalog and the milestones list.
 *
 * Usage:
 *   pnpm timeline:build [--raw <dir>]
 *
 * <dir> (scripts/timeline/sources by default) holds meetup/, github/ and conferences/. Flickr
 * albums are expanded to direct photo URLs once and cached under <dir>/flickr.
 * Re-runnable: the output only depends on the inputs, content/timeline/overrides.json,
 * broken-photos.json and the community directory, plus the slugs already published (an event
 * keeps its URL when its title changes).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createReader } from "@keystatic/core/reader";

import keystaticConfig from "../../keystatic.config";
import type {
  TimelineCommunity,
  TimelineEvent,
  TimelineKind,
  TimelinePerson,
  TimelinePhoto,
  TimelineTalk,
} from "../../src/lib/timeline/types";

const args = process.argv.slice(2);
const RAW = path.resolve(
  args.includes("--raw") ? args[args.indexOf("--raw") + 1] : path.join(import.meta.dirname, "sources")
);
const OUT = path.resolve("content/timeline");
const CACHE = path.join(RAW, "flickr");

const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(RAW, file), "utf8")) as T;

// ---------------------------------------------------------------- raw shapes

type MeetupPhoto = { highResUrl: string; isGroupDefault?: boolean } | null;
type MeetupHost = { id: string; name: string };
type MeetupEvent = {
  id: string;
  group: string;
  title: string;
  dateTime: string;
  endTime?: string | null;
  status: string;
  eventType: "PHYSICAL" | "ONLINE" | "HYBRID";
  eventUrl: string;
  waybackUrl?: string;
  venue?: { name?: string; city?: string; country?: string; lat?: number; lon?: number } | null;
  rsvps?: number;
  featuredPhoto: MeetupPhoto;
  displayPhoto: MeetupPhoto;
  photoAlbum?: { photoCount?: number; photos?: string[] } | null;
  /** The event's hosts on Meetup: member id and display name */
  hosts?: MeetupHost[];
  description?: string | null;
};
type MeetupGroup = {
  urlname: string;
  currentUrlname?: string;
  requestedAs?: string[];
  name: string;
  activity: "active" | "dormant" | "dead";
  flag?: { tech: "tech" | "borderline" | "no"; name?: string };
  pastEvents: number;
  link?: string;
  foundedDate?: string;
  members?: number;
};
type GithubEvent = {
  date: string;
  end_date?: string | null;
  date_precision?: "day" | "month" | "year";
  title: string;
  community: string;
  kind: string;
  venue?: string | null;
  city?: string | null;
  talks?: { title: string; speakers?: string[]; slides?: string | null; video?: string | null }[];
  photos?: (string | { url: string })[];
  links?: string[];
  source_repo: string;
  source_path?: string;
  attendees?: number;
  status?: string;
  upcoming?: boolean;
};
type Edition = {
  series: string;
  series_slug: string;
  category: string;
  edition?: string;
  year: number;
  start_date?: string | null;
  end_date?: string | null;
  city?: string | null;
  venue?: string | null;
  organizers?: string[];
  /** A number, or how the source put it ("600+ (Montevideo)") */
  attendees?: number | string | null;
  talks?: number | null;
  official_url?: string | null;
  url_alive?: boolean;
  wayback_url?: string | null;
  photos?: { url: string; kind?: string; license?: string; note?: string }[];
  videos?: { url: string; kind?: string }[];
  confidence?: "high" | "medium" | "low";
  date_source?: string | null;
  notes?: string | null;
  flags?: string[] | string;
};
/** content/timeline/hitos.json: curated, in Spanish */
type Milestone = {
  date: string;
  type: "first" | "founding" | "other" | "ended" | "rename";
  /** A timeline community slug, or "hitos" for the scene at large */
  community: string;
  title: string;
  description?: string;
  layer: "community" | "ecosystem";
  source?: string;
  confidence?: "medium" | "low";
};
type Overrides = {
  /** Event ids (or slugs) that never render */
  hide?: string[];
  /** Meetup urlname → community slug, for groups that are the same community under another name */
  groupCommunity?: Record<string, string>;
  /** Community slug → layer */
  layer?: Record<string, "community" | "ecosystem">;
  /** Extra photos for an event id, e.g. Wayback captures */
  photos?: Record<string, TimelinePhoto[]>;
  /**
   * Event id → what research corrected: the date it really happened (a source announced another,
   * or only gave the month) and the title that goes with it. Applied before events merge, so a
   * corrected date can land on the same event from another source and join it.
   */
  fix?: Record<string, Partial<Pick<TimelineEvent, "start" | "end" | "title">>>;
  /** The conference catalog's notes in English (attendance, venues, organizers) → how the page says them */
  spanish?: Record<string, string>;
  /** Profile slugs taken down on request: off every event (hide), or without their photo (noPhoto) */
  people?: { hide?: string[]; noPhoto?: string[] };
  /** Photo URLs taken down on request (someone in it asked): off every event */
  hidePhotos?: string[];
};

// ---------------------------------------------------------------- helpers

// Combining accents (U+0300–U+036F), built from char codes so the formatter can't inline them invisibly
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

const slugify = (value: string) =>
  value
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const dayOf = (value: string) => value.slice(0, 10);

// A description whole, as Markdown: the site renders it (escapes included), so it's only tidied
const clean = (value: string | null | undefined) =>
  value
    ?.replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || undefined;

const tokens = (value: string) =>
  new Set(
    slugify(value)
      .split("-")
      .filter((t) => t.length > 2 && !/^\d+$/.test(t) && !STOP.has(t))
  );
const STOP = new Set(["the", "and", "del", "las", "los", "con", "para", "meetup", "montevideo", "uruguay", "edicion"]);
const similarity = (a: string, b: string) => {
  const x = tokens(a);
  const y = tokens(b);
  // Titles made only of short or stop words ("La Meetup 2024") compare whole
  if (!x.size || !y.size) return slugify(a).startsWith(slugify(b)) || slugify(b).startsWith(slugify(a)) ? 1 : 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size);
};

const FLICKR_LICENSES: Record<number, string> = {
  0: "Todos los derechos reservados",
  1: "CC BY-NC-SA 2.0",
  2: "CC BY-NC 2.0",
  3: "CC BY-NC-ND 2.0",
  4: "CC BY 2.0",
  5: "CC BY-SA 2.0",
  6: "CC BY-ND 2.0",
  7: "Sin derechos conocidos",
  9: "CC0",
  10: "Dominio público",
  11: "CC BY 4.0",
  12: "CC BY-SA 4.0",
  13: "CC BY-ND 4.0",
  14: "CC BY-NC 4.0",
  15: "CC BY-NC-SA 4.0",
  16: "CC BY-NC-ND 4.0",
};

/** One Flickr album page (first ~100 photos) as direct live.staticflickr.com URLs, cached on disk */
async function flickrAlbum(url: string): Promise<TimelinePhoto[]> {
  const id = /albums\/(\d+)/.exec(url)?.[1];
  if (!id) return [];
  const cached = path.join(CACHE, `${id}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")) as TimelinePhoto[];

  const response = await fetch(url.replace(/\/?$/, "/"), {
    headers: { "user-agent": "Mozilla/5.0 (owu.uy timeline)" },
  });
  if (!response.ok) {
    console.warn(`  flickr ${id}: HTTP ${response.status}`);
    return [];
  }
  const html = await response.text();
  const start = html.indexOf("{", html.indexOf("modelExport:"));
  let depth = 0;
  let end = start;
  for (; end < html.length; end++) {
    if (html[end] === "{") depth++;
    else if (html[end] === "}" && --depth === 0) break;
  }
  type Size = { data: { url: string; width: number; height: number } };
  type FlickrPhoto = {
    data: {
      id: string;
      title?: string;
      license?: number;
      sizes: { data: Record<string, Size> };
      owner?: { data?: { nsid?: string } };
    };
  };
  const model = JSON.parse(html.slice(start, end + 1)) as {
    main: {
      "set-models": {
        data: {
          owner: { data: { nsid?: string; pathAlias?: string; realname?: string; username?: string } };
          photoPageList: { data: { _data: (FlickrPhoto | null)[] } };
        };
      }[];
    };
  };
  const set = model.main["set-models"][0].data;
  const owner = set.owner.data;
  const by = owner.realname || owner.username || undefined;
  const photos = set.photoPageList.data._data.flatMap((entry): TimelinePhoto[] => {
    if (!entry) return [];
    const sizes = entry.data.sizes.data;
    const size = sizes.b ?? sizes.c ?? sizes.z ?? sizes.m;
    if (!size) return [];
    return [
      {
        src: `https:${size.data.url}`,
        w: size.data.width,
        h: size.data.height,
        page: `https://www.flickr.com/photos/${owner.pathAlias ?? owner.nsid}/${entry.data.id}/`,
        by,
        source: "Flickr",
        license: FLICKR_LICENSES[entry.data.license ?? 0],
      },
    ];
  });
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, JSON.stringify(photos));
  await new Promise((resolve) => setTimeout(resolve, 600));
  return photos;
}

// ---------------------------------------------------------------- communities

/** How people call them: the sources' names carry subtitles, parentheses and English */
const DISPLAY_NAME: Record<string, string> = {
  "genexus-meeting": "Encuentro GeneXus",
  "icann-montevideo": "ICANN en Montevideo",
  jiap: "JIAP",
  "ingenieria-demuestra": "Ingeniería deMuestra",
  "oracle-tour-montevideo": "Oracle User Group Tour",
  "segurinfo-uruguay": "Segurinfo Uruguay",
  "ubuntu-uy-events": "Ubuntu Uruguay",
  "juegarte-san-carlos": "JuegArte",
  cigras: "CIGRAS",
  "pyday-uy": "PyDay Uruguay",
  "dal-uruguay": "Desarrollando América Latina",
  "sharing-the-point-montevideo": "Sharing the Point",
  "lacnic-montevideo": "LACNIC en Montevideo",
  "devfest-montevideo": "DevFest Uruguay",
  "owasp-appsec-montevideo": "OWASP AppSec",
  condatos: "ConDatos",
  oktoberdatafest: "OktoberDATAFEST",
  jsconfuy: "JSConf Uruguay",
  dateidea: "DateIdea",
  clei: "CLEI",
  "netconf-uy": ".NET Conf UY",
  "agiles-latam": "Ágiles",
  "hackathon-agro": "Hackathon Agro",
  "girls-in-tech-uruguay": "Girls in Tech Uruguay",
  "24h-innovacion-uruguay": "24 horas de innovación",
  "level-uy": "LEVEL UY",
  "jovenes-a-programar": "Jóvenes a Programar",
  "cafe-de-data": "Café de Data",
  "techy-por-el-dia": "Techy por el día",
  khipu: "KHIPU",
  latinr: "LatinR",
  "jam2jam-winter-jam": "Jam2Jam",
  mitconf: "MITConf",
  "owu-la-meetup": "La Meetup",
  "campus-party-uruguay": "Campus Party Uruguay",
  "owu-codepop": "CODE Pop",
  "gdg-montevideo-hackathons": "Hackatón GDG",
  "io-extended-montevideo": "Google I/O Extended",
  "space-apps-uruguay": "NASA Space Apps Uruguay",
  "wordcamp-montevideo": "WordCamp Montevideo",
  "jsday-uruguay": "JSDay Uruguay",
  "percona-university": "Percona University",
  "uruguay-salesforce-developer-group": "Uruguay Salesforce Developer Group",
  "proyecto-kanban": "Proyecto Kanban",
  "maldonado-new-technology-meetup": "Maldonado New Technology Meetup",
};
/** A display name that a source spelled with extras, to its plain form */
const plainName = (name: string) =>
  name
    .replace(/\s*\((?:MontevideoSDG\.com|later [^)]*|Mujeres IT)\)\s*$/, "")
    .replace(/^Colaboradores en Gestión de Proyectos -> /, "")
    .trim();

const reader = createReader(process.cwd(), keystaticConfig);
const directory = await reader.collections.communities.all();
const directoryByMeetup = new Map<string, string>();
for (const { slug, entry } of directory) {
  const urlname = /meetup\.com\/([^/?#]+)/.exec(entry.meetup ?? "")?.[1];
  if (urlname) directoryByMeetup.set(urlname.toLowerCase(), slug);
}

const overrides: Overrides = existsSync(path.join(OUT, "overrides.json"))
  ? (JSON.parse(readFileSync(path.join(OUT, "overrides.json"), "utf8")) as Overrides)
  : {};

const communities = new Map<string, TimelineCommunity>();
const addCommunity = (community: TimelineCommunity) => {
  const existing = communities.get(community.slug);
  if (existing) {
    existing.aliases = [...new Set([...(existing.aliases ?? []), ...(community.aliases ?? []), community.name])].filter(
      (alias) => alias !== existing.name
    );
    existing.meetup ??= community.meetup;
    if (existing.status !== "activa" && community.status === "activa") existing.status = "activa";
    return existing;
  }
  communities.set(community.slug, community);
  return community;
};

const fromDirectory = (slug: string, fallback: Omit<TimelineCommunity, "slug">): TimelineCommunity => {
  const entry = directory.find((d) => d.slug === slug)?.entry;
  if (!entry) return { slug, ...fallback };
  return {
    ...fallback,
    slug,
    name: entry.name,
    directory: true,
    logo: entry.picture ?? undefined,
    topics: entry.topics.length ? [...entry.topics] : fallback.topics,
    website: entry.website ?? fallback.website,
  };
};

const TOPIC_RULES: [RegExp, string][] = [
  [/ladies|mujer|girls|nahual|women|rails girls/i, "diversidad"],
  [/owasp|secur|segur|red team|wazuh|hack(er)?s? \/|cigras/i, "seguridad"],
  [/test|qa\b|abstracta/i, "testing"],
  [
    /data|datos|ia\b|\bai\b|intelig|machine|deep|mlops|\br\b|r-ladies|latinr|khipu|connectia|elastic|databricks|neuro/i,
    "data-ia",
  ],
  [
    /aws|azure|cloud|devops|docker|openstack|kubernetes|red hat|linux|sysarmy|mysql|dba|sql|percona|powershell/i,
    "cloud",
  ],
  [/flutter|mobile|ios|android|swift|xamarin|react native|apple/i, "mobile"],
  [
    /\bjs\b|javascript|jsconf|angular|react|vue|ember|front|web|wordpress|drupal|ux|design|ixda|dribbble|sketch|meteor/i,
    "web",
  ],
  [
    /ruby|python|py|elixir|rust|scala|php|laravel|symfony|java|\.net|grails|clojure|go en|zig|genexus|gug|salesforce/i,
    "lenguajes",
  ],
  [/agile|agil|kanban|product|leadership|soft skills|lean|scrum|freelanc|remote/i, "carrera"],
];
const guessTopics = (name: string) => {
  const hit = TOPIC_RULES.find(([pattern]) => pattern.test(name));
  return [hit ? hit[1] : "general"];
};

// Meetup groups: the tech ones are communities, the borderline ones (crypto, startups, network re-posts) the ecosystem
const groups = readJson<MeetupGroup[]>("meetup/groups.json").filter(
  (group) => group.flag && group.flag.tech !== "no" && group.pastEvents > 0
);
const GROUP_COMMUNITY: Record<string, string> = {
  pyladiesuy: "pyladies-uruguay",
  "maldonado-new-technology-meetup": "maldonado-new-technology-meetup",
  "colaboradores-en-gestion-de-proyectos": "proyecto-kanban",
  "uruguay-salesforce-developer-user-group": "uruguay-salesforce-developer-group",
  gdgmontevideo: "gdg-montevideo",
  gdguruguay: "gdg-montevideo",
  "testing-uy": "testinguy",
  ...overrides.groupCommunity,
};
type GroupStats = Record<string, { members: number | null; rating: number | null; ratings: number }>;
const groupStats: GroupStats = existsSync(path.join(RAW, "meetup/group-stats.json"))
  ? readJson<GroupStats>("meetup/group-stats.json")
  : {};
const communityOfGroup = new Map<string, string>();
for (const group of groups) {
  const names = [group.urlname, group.currentUrlname, ...(group.requestedAs ?? [])]
    .filter(Boolean)
    .map((n) => n!.toLowerCase());
  const mapped = names.map((n) => GROUP_COMMUNITY[n] ?? directoryByMeetup.get(n)).find(Boolean);
  const name = plainName(group.flag?.name && !/^(nuevo|new)$/i.test(group.flag.name) ? group.flag.name : group.name);
  const slug = mapped ?? slugify(name);
  const community = addCommunity(
    fromDirectory(slug, {
      name,
      kind: "grupo",
      layer: group.flag?.tech === "borderline" ? "ecosystem" : "community",
      status: group.activity === "active" ? "activa" : group.activity === "dormant" ? "en-pausa" : "cerrada",
      topics: guessTopics(name),
      meetup: group.activity === "dead" ? undefined : (group.link ?? `https://www.meetup.com/${group.urlname}/`),
    })
  );
  communityOfGroup.set(group.urlname, community.slug);
  // Its size and rating today; a community with two groups goes by its bigger one
  const today = groupStats[group.urlname];
  if (today?.members && today.members > (community.members ?? 0)) {
    community.members = today.members;
    community.rating = today.rating ?? undefined;
    community.ratings = today.ratings || undefined;
  }
}

// Conference series: their own lane, unless a community runs them
const SERIES_COMMUNITY: Record<string, string> = {
  "owasp-day-uruguay": "owasp-uruguay",
  "owasp-latamtour-montevideo": "owasp-uruguay",
  "owasp-appsec-montevideo": "owasp-uruguay",
  "owasp-uruguay-other": "owasp-uruguay",
  connectia: "connectia",
  "owu-la-meetup": "owu",
  "owu-codepop": "owu",
  "owu-conf": "owu",
  "devfest-montevideo": "gdg-montevideo",
  "io-extended-montevideo": "gdg-montevideo",
  "gdg-montevideo-hackathons": "gdg-montevideo",
  "girls-in-tech-uruguay": "girls-in-tech-uruguay",
  testinguy: "testinguy",
};
const ECOSYSTEM_SERIES = new Set([
  "punta-tech-meetup",
  "punta-tech-week",
  "lacnic-montevideo",
  "icann-montevideo",
  "cigras",
  "segurinfo-uruguay",
  "sharing-the-point-montevideo",
  "24h-innovacion-uruguay",
  "campus-party-uruguay",
  "hackathon-agro",
  "dateidea",
  "jovenes-a-programar",
]);
const flagsOf = (edition: Edition) =>
  Array.isArray(edition.flags) ? edition.flags : edition.flags ? edition.flags.split(",") : [];
const isEcosystemEdition = (edition: Edition) =>
  ECOSYSTEM_SERIES.has(edition.series_slug) ||
  ["vendor-conference", "institutional", "graduation"].includes(edition.category) ||
  flagsOf(edition).some((flag) => flag === "vendor" || flag === "institutional");

const editions = readJson<Edition[]>("conferences/editions.json");
for (const edition of editions) {
  const slug = SERIES_COMMUNITY[edition.series_slug] ?? edition.series_slug;
  if (communities.has(slug)) continue;
  addCommunity(
    fromDirectory(slug, {
      name: DISPLAY_NAME[slug] ?? edition.series,
      kind: "serie",
      layer: isEcosystemEdition(edition) ? "ecosystem" : "community",
      status: "cerrada",
      topics: guessTopics(edition.series),
      website: edition.url_alive ? (edition.official_url ?? undefined) : undefined,
    })
  );
}
addCommunity({
  slug: "owu",
  name: "OWU",
  kind: "grupo",
  layer: "community",
  status: "activa",
  topics: ["general"],
  website: "https://www.owu.uy",
});

// GitHub archives name their community in prose
const GITHUB_COMMUNITY: Record<string, string> = {
  "OWASP Uruguay": "owasp-uruguay",
  "TechMeetup UY": "techmeetup-uy",
  "DevOpsDays Montevideo": "devopsdays-montevideo",
  "Ember Montevideo": "group:ember-montevideo",
  "JSConf Uruguay": "jsconfuy",
  "R-Ladies Montevideo": "group:rladies-montevideo",
  "RubyConf Uruguay": "rubyconf-uy",
  "Ruby Montevideo": "group:ruby-montevideo",
  "Neo / Coderetreat": "coderetreat-montevideo",
  "PHP Montevideo (PHPmvd)": "group:PHPmvd",
  "Mobile UY": "group:MobileDayUY",
  "Angular MVD": "group:angular-mvd",
  "ReactJS Uruguay": "group:ReactJS-Uruguay",
  "js.uy": "jsday-uruguay",
  "WordPress Uruguay": "wordcamp-montevideo",
  "ConnectIA / Data Science UY": "connectia",
  "GDG Montevideo": "gdg-montevideo",
  "Rust Latam": "rust-latam",
  Percona: "percona-university",
  "OWU (Elixir MVD, Ruby UY, Python MVD)": "owu",
};
const githubCommunity = (label: string) => {
  const target = GITHUB_COMMUNITY[label] ?? slugify(label);
  return target.startsWith("group:") ? (communityOfGroup.get(target.slice(6)) ?? slugify(target.slice(6))) : target;
};

// ---------------------------------------------------------------- events

// Organizers are names until the end, and Meetup's hosts stay apart from them: a researched list
// replaces the catalog's, not the hosts
// Speakers too: names until the end
type RawTalk = Omit<TimelineTalk, "speakers"> & { speakers?: string[] };
type Candidate = Omit<TimelineEvent, "organizers" | "talks"> & {
  origin: "conference" | "meetup" | "github" | "milestone";
  organizers?: string[];
  hosts?: MeetupHost[];
  talks?: RawTalk[];
};
const candidates: Candidate[] = [];
const now = new Date();

// meetup.com
// A venue's coordinates, when it's in Uruguay (Buenos Aires is inside a box around it) and they
// are too (an online event's, or a venue left blank, are somewhere else)
const geoOf = (venue: MeetupEvent["venue"]): [number, number] | undefined =>
  venue?.country?.toLowerCase() === "uy" &&
  venue.lat &&
  venue.lon &&
  venue.lat < -30 &&
  venue.lat > -35.1 &&
  venue.lon < -53 &&
  venue.lon > -58.6
    ? [Math.round(venue.lat * 1e4) / 1e4, Math.round(venue.lon * 1e4) / 1e4]
    : undefined;
const meetupGroupNames = new Map(
  groups.map((group) => [group.urlname, communities.get(communityOfGroup.get(group.urlname)!)!.name])
);
for (const event of readJson<MeetupEvent[]>("meetup/events.json")) {
  const community = communityOfGroup.get(event.group);
  if (!community || event.status !== "PAST") continue;
  const group = meetupGroupNames.get(event.group) ?? event.group;
  const photos: TimelinePhoto[] = [];
  const credit = { source: "Meetup", by: group, page: event.eventUrl };
  // The event's own image is its flyer almost always; the album has the photos people took
  for (const photo of [event.featuredPhoto, event.displayPhoto]) {
    if (photo?.highResUrl && !photo.isGroupDefault) photos.push({ src: photo.highResUrl, ...credit, banner: true });
  }
  for (const src of event.photoAlbum?.photos ?? []) photos.push({ src, ...credit });
  const title = event.title.replace(/^\[EXTERNAL\]\s*/i, "").trim();
  candidates.push({
    origin: "meetup",
    id: `meetup:${event.id}`,
    slug: "",
    title,
    start: event.dateTime,
    end: event.endTime ?? undefined,
    kind: /hackat[oó]n|hackathon/i.test(title)
      ? "hackaton"
      : /taller|workshop|bootcamp|coding dojo/i.test(title)
        ? "taller"
        : "meetup",
    layer: communities.get(community)!.layer,
    online: event.eventType === "ONLINE" || undefined,
    community,
    venue: event.eventType === "ONLINE" ? undefined : (event.venue?.name ?? undefined),
    city: event.eventType === "ONLINE" ? undefined : (event.venue?.city ?? undefined),
    geo: event.eventType === "ONLINE" ? undefined : geoOf(event.venue),
    rsvps: event.rsvps || undefined,
    url: event.waybackUrl ? undefined : event.eventUrl,
    wayback: event.waybackUrl,
    description: clean(event.description),
    photos: dedupePhotos(photos),
    photoCount: event.photoAlbum?.photoCount || undefined,
    hosts: event.hosts?.length ? event.hosts : undefined,
    sources: [{ label: "Meetup", url: event.waybackUrl ?? event.eventUrl }],
  });
}

// GitHub archives
for (const file of readdirSync(path.join(RAW, "github")).filter((f) => f.startsWith("events-"))) {
  for (const event of readJson<GithubEvent[]>(`github/${file}`)) {
    if (event.kind === "series" || event.upcoming || event.status === "cancelled") continue;
    const community = githubCommunity(event.community);
    if (!communities.has(community)) {
      addCommunity(
        fromDirectory(community, {
          name: DISPLAY_NAME[community] ?? event.community,
          kind: "grupo",
          layer: community === "percona-university" ? "ecosystem" : "community",
          status: "cerrada",
          topics: guessTopics(event.community),
        })
      );
    }
    const repo = `https://github.com/${event.source_repo}`;
    candidates.push({
      origin: "github",
      id: `github:${event.source_repo}:${event.date}:${slugify(event.title).slice(0, 40)}`,
      slug: "",
      title: event.title.trim(),
      start: event.date,
      end: event.end_date ?? undefined,
      precision: event.date_precision === "day" ? undefined : event.date_precision,
      kind: event.kind === "conference" ? "conferencia" : event.kind === "workshop" ? "taller" : "meetup",
      layer: communities.get(community)!.layer,
      community,
      venue: event.venue ?? undefined,
      city: event.city ?? undefined,
      rsvps: event.attendees || undefined,
      talks: event.talks?.length
        ? event.talks.map((talk) => ({
            title: talk.title,
            speakers: talk.speakers?.length ? talk.speakers : undefined,
            slides: talk.slides ?? undefined,
            video: talk.video ?? undefined,
          }))
        : undefined,
      photos: dedupePhotos(
        (event.photos ?? []).map((photo) => ({
          src: typeof photo === "string" ? photo : photo.url,
          source: "GitHub",
          by: event.source_repo,
          page: repo,
        }))
      ),
      links: (event.links ?? [])
        .filter((url) => !url.includes("meetup.com"))
        .map((url) => ({ label: linkLabel(url), url })),
      sources: [
        {
          label: `GitHub · ${event.source_repo}`,
          url: event.source_path ? `${repo}/blob/HEAD/${event.source_path}` : repo,
        },
      ],
    });
  }
}

// Conference catalog
const KIND_OF_CATEGORY: Record<string, TimelineKind> = { hackathon: "hackaton", "game-jam": "jam", workshop: "taller" };
const horizon = new Date(now.getTime() + 120 * 86_400_000).toISOString();
for (const edition of editions) {
  if (!edition.start_date || edition.start_date > horizon) continue;
  const flags = flagsOf(edition);
  if (flags.includes("cancelled")) continue;
  const community = SERIES_COMMUNITY[edition.series_slug] ?? edition.series_slug;
  const layer = isEcosystemEdition(edition) ? "ecosystem" : "community";
  const photos: TimelinePhoto[] = [];
  const links: { label: string; url: string }[] = [];
  for (const photo of edition.photos ?? []) {
    if (/flickr\.com\/photos\/[^/]+\/albums\/\d+/.test(photo.url))
      photos.push(...(await flickrAlbum(photo.url)).slice(0, 60));
    else if (/\.(jpe?g|png|webp)(\?|$)/i.test(photo.url) || photo.url.includes("raw.githubusercontent"))
      photos.push({ src: photo.url, source: sourceName(photo.url), page: photo.url, license: photo.license });
    else links.push({ label: `Fotos · ${sourceName(photo.url)}`, url: photo.url });
  }
  for (const video of edition.videos ?? []) links.push({ label: `Videos · ${sourceName(video.url)}`, url: video.url });
  if (edition.official_url)
    links.unshift({
      label: edition.url_alive ? "Sitio oficial" : "Sitio original (ya no está)",
      url: edition.url_alive ? edition.official_url : (edition.wayback_url ?? edition.official_url),
    });
  const series = DISPLAY_NAME[edition.series_slug] ?? edition.series.replace(/\s*\(.*\)\s*$/, "").split(" / ")[0];
  const title = /\d{4}/.test(series) ? series : `${series} ${edition.year}`;
  const upcoming = new Date(edition.start_date) > now;
  candidates.push({
    origin: "conference",
    id: `conf:${edition.series_slug}:${edition.start_date}`,
    slug: "",
    title,
    start: edition.start_date,
    end: edition.end_date && edition.end_date !== edition.start_date ? edition.end_date : undefined,
    precision: /^\d{4}$/.test(edition.start_date)
      ? "year"
      : /^\d{4}-\d{2}$/.test(edition.start_date)
        ? "month"
        : undefined,
    kind: KIND_OF_CATEGORY[edition.category] ?? "conferencia",
    layer,
    online: flags.includes("online") || flags.includes("moved-online") || undefined,
    community,
    venue: edition.venue ?? undefined,
    city: edition.city ?? undefined,
    rsvps: typeof edition.attendees === "number" ? edition.attendees : undefined,
    attendance: typeof edition.attendees === "string" ? edition.attendees : undefined,
    // The catalog's "talks" is a count, or a research note in English ("8 games (…)", "Workshops Dec 6…"):
    // only a count makes "N charlas"
    talkCount: typeof edition.talks === "number" ? edition.talks : undefined,
    organizers: edition.organizers?.length ? edition.organizers : undefined,
    photos: dedupePhotos(photos),
    links,
    sources: [
      edition.date_source ? { label: "Fuente de la fecha", url: edition.date_source } : null,
      edition.wayback_url ? { label: "Wayback Machine", url: edition.wayback_url } : null,
    ].filter((s): s is { label: string; url: string } => Boolean(s)),
    confidence: edition.confidence === "high" ? undefined : edition.confidence,
    upcoming: upcoming || undefined,
  });
}

// Milestones: the ones that happened at an event become a highlight on it, the rest are their own entries
for (const milestone of JSON.parse(readFileSync(path.join(OUT, "hitos.json"), "utf8")) as Milestone[]) {
  const community = communities.has(milestone.community) ? milestone.community : "hitos";
  candidates.push({
    origin: "milestone",
    id: `hito:${milestone.date}:${slugify(milestone.title).slice(0, 40)}`,
    slug: "",
    title: milestone.title,
    start: milestone.date,
    precision: milestone.date.length === 4 ? "year" : milestone.date.length === 7 ? "month" : undefined,
    kind: "hito",
    milestoneType: milestone.type,
    layer: milestone.layer,
    community,
    description: milestone.description,
    sources: milestone.source ? [{ label: "Fuente", url: milestone.source }] : [],
    confidence: milestone.confidence,
  });
}
addCommunity({
  slug: "hitos",
  name: "Hitos de la escena",
  kind: "serie",
  layer: "community",
  status: "activa",
  topics: ["general"],
});

// ---------------------------------------------------------------- dedupe

// A DokuWiki "_detail" link is the photo's page (HTML); the file itself is under "_media".
// A declaration, like dedupePhotos: both run before this part of the file is reached
function asFile(photo: TimelinePhoto): TimelinePhoto {
  const detail = /\/_detail\/([^?#]+)(?:[?#].*)?$/;
  return detail.test(photo.src)
    ? { ...photo, src: photo.src.replace(detail, "/_media/$1"), page: photo.page ?? photo.src }
    : photo;
}

function dedupePhotos(photos: TimelinePhoto[]) {
  const seen = new Set<string>();
  return photos.map(asFile).filter((photo) => {
    const key = photo.src.replace(/(highres|600|thumb)_/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function sourceName(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("flickr")) return "Flickr";
  if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
  if (host.includes("github")) return "GitHub";
  if (host.includes("archive.org")) return "Wayback Machine";
  if (host.includes("facebook")) return "Facebook";
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("twitter") || host === "x.com") return "X";
  return host;
}
function linkLabel(url: string) {
  if (/slides|speakerdeck|slideshare|docs\.google|drive\.google/.test(url)) return "Slides";
  if (/youtube|youtu\.be|vimeo/.test(url)) return "Video";
  return sourceName(url);
}

const PRIORITY = { conference: 3, meetup: 2, github: 1, milestone: 0 } as const;
const within = (day: string, event: Candidate) => {
  const start = dayOf(event.start);
  const end = event.end ? dayOf(event.end) : start;
  return start.length === 10 && day >= start && day <= end;
};

function merge(base: Candidate, other: Candidate) {
  base.photos = dedupePhotos([...(base.photos ?? []), ...(other.photos ?? [])]);
  if (!base.photos.length) delete base.photos;
  if ((other.talks?.length ?? 0) > (base.talks?.length ?? 0)) base.talks = other.talks;
  base.links = [...(base.links ?? []), ...(other.links ?? [])].filter(
    (link, i, all) => all.findIndex((l) => l.url === link.url) === i
  );
  if (!base.links.length) delete base.links;
  base.sources = [...base.sources, ...other.sources].filter(
    (source, i, all) => all.findIndex((s) => s.url === source.url) === i
  );
  base.rsvps = Math.max(base.rsvps ?? 0, other.rsvps ?? 0) || undefined;
  base.venue ??= other.venue;
  base.city ??= other.city;
  if (base.venue === other.venue) base.geo ??= other.geo;
  base.url ??= other.url;
  base.wayback ??= other.wayback;
  base.description ??= other.description;
  base.photoCount = Math.max(base.photoCount ?? 0, other.photoCount ?? 0) || undefined;
  if (other.hosts) base.hosts = [...(base.hosts ?? []), ...other.hosts];
  base.mergedIds = [...(base.mergedIds ?? []), other.id, ...(other.mergedIds ?? [])];
}

for (const candidate of candidates) {
  const fix = overrides.fix?.[candidate.id];
  if (!fix) continue;
  Object.assign(candidate, fix);
  if (fix.start && !fix.end) delete candidate.end;
  // A corrected date is a day
  if (fix.start?.length === 10) delete candidate.precision;
}

const hidden = new Set(overrides.hide);
for (const id of hidden)
  if (!candidates.some((candidate) => candidate.id === id))
    console.warn(`overrides.json hide: no event has the id "${id}"`);
const events: Candidate[] = [];
const ordered = candidates
  .filter((candidate) => !hidden.has(candidate.id))
  .sort((a, b) => PRIORITY[b.origin] - PRIORITY[a.origin] || a.start.localeCompare(b.start));

for (const candidate of ordered) {
  const day = dayOf(candidate.start);
  // Same community, same day (or inside a multi-day edition): one event, unless both are distinct Meetup events
  const sameCommunity =
    day.length === 10
      ? events.filter((e) => e.community === candidate.community && (within(day, e) || dayOf(e.start) === day))
      : [];
  let target = sameCommunity.find((e) => !(e.origin === "meetup" && candidate.origin === "meetup"));
  if (candidate.origin === "milestone") {
    // A day-precise milestone on an event's day, or the "first" of a series in the year/month it names
    target =
      sameCommunity.find((e) => e.kind !== "hito") ??
      (candidate.milestoneType === "first" && day.length < 10
        ? events.find((e) => e.community === candidate.community && e.kind !== "hito" && e.start.startsWith(day))
        : undefined);
  }
  // A conference that a group also posted on Meetup (La Meetup in PHP MVD's group, a DevFest in GDG's…)
  if (!target && day.length === 10 && candidate.origin !== "milestone") {
    target = events.find(
      (e) => e.kind === "conferencia" && within(day, e) && similarity(e.title, candidate.title) >= 0.5
    );
  }
  if (target) {
    if (candidate.origin === "milestone") {
      target.highlights = [...(target.highlights ?? []), candidate.title];
      target.sources.push(...candidate.sources);
    } else merge(target, candidate);
    continue;
  }
  events.push(candidate);
}

for (const [id, photos] of Object.entries(overrides.photos ?? {})) {
  const event = events.find((e) => e.id === id || e.mergedIds?.includes(id));
  if (event) event.photos = dedupePhotos([...photos, ...(event.photos ?? [])]);
}

// Research done event by event (content/timeline/enrichment/*.json, keyed by event id): what the
// sources above left out of editions they barely list. It fills gaps; what a source says stays.
// Its "description" is a summary written for the timeline, kept apart from the announcement.
type Enrichment = Partial<
  Pick<TimelineEvent, "description" | "attendance" | "rsvps" | "venue" | "city" | "photos" | "links">
> & { organizers?: string[]; talks?: RawTalk[]; sources: TimelineEvent["sources"] };
const dedupeLinks = (links: TimelineEvent["sources"]) => [...new Map(links.map((link) => [link.url, link])).values()];
const NOT_A_PHOTO =
  /\b(flyer|afiche|banner|logo|logotipo|placa|pieza gráfica|gráfica|captura|screenshot|póster|poster|portada|miniatura|thumbnail|isotipo)\b/i;
const ENRICHMENT = path.join(OUT, "enrichment");
for (const file of existsSync(ENRICHMENT) ? readdirSync(ENRICHMENT).filter((name) => name.endsWith(".json")) : []) {
  const entries = JSON.parse(readFileSync(path.join(ENRICHMENT, file), "utf8")) as Record<string, Enrichment>;
  for (const [id, extra] of Object.entries(entries)) {
    const event = events.find((e) => e.id === id || e.mergedIds?.includes(id));
    if (!event) {
      console.warn(`enrichment/${file}: no event ${id}`);
      continue;
    }
    // Written from the sources, so it's the event's summary, not its announcement
    event.summary ??= clean(extra.description);
    if (!event.talks?.length && extra.talks?.length) event.talks = extra.talks;
    // Researched attendance is in Spanish and checked; the catalog's is a note in English
    event.attendance = extra.attendance ?? event.attendance;
    event.rsvps ??= extra.rsvps;
    // Somewhere else than Meetup says: its coordinates were the other place's
    if (extra.venue && extra.venue !== event.venue) delete event.geo;
    event.venue = extra.venue ?? event.venue;
    event.city = extra.city ?? event.city;
    // A researched list replaces the catalog's (joining them repeated people under two spellings)
    if (extra.organizers?.length) event.organizers = extra.organizers;
    // The research says in each alt what a picture is: flyers, logos and captures aren't photos of the event
    if (extra.photos?.length)
      event.photos = dedupePhotos([
        ...(event.photos ?? []),
        ...extra.photos.map((photo) =>
          NOT_A_PHOTO.test(photo.alt ?? "") ? { ...photo, banner: true as const } : photo
        ),
      ]);
    if (extra.links?.length) event.links = dedupeLinks([...(event.links ?? []), ...extra.links]);
    event.sources = dedupeLinks([...event.sources, ...extra.sources]);
  }
}

// Pictures looked at one by one (contact sheets of every candidate) that aren't photos of the event:
// flyers inside albums, speaker cards, logos, slides as files, screen captures
const notPhotos = new Set<string>(
  existsSync(path.join(OUT, "not-photos.json"))
    ? (JSON.parse(readFileSync(path.join(OUT, "not-photos.json"), "utf8")) as { src: string[] }).src
    : []
);
// Pictures that stopped loading (scripts/timeline/photos.ts found them gone twice): photos,
// profile pictures, and talks whose video was taken down
const broken = new Set([
  ...Object.keys(
    existsSync(path.join(OUT, "broken-photos.json"))
      ? (JSON.parse(readFileSync(path.join(OUT, "broken-photos.json"), "utf8")) as Record<string, unknown>)
      : {}
  ),
  // Taken down on request: gone the same way
  ...(overrides.hidePhotos ?? []),
]);
const shownPhotos = new Set(events.flatMap((event) => (event.photos ?? []).map((photo) => photo.src)));
for (const src of overrides.hidePhotos ?? [])
  if (!shownPhotos.has(src)) console.warn(`overrides.json hidePhotos: no event shows ${src}`);
for (const event of events) {
  if (event.photos)
    event.photos = event.photos
      .filter((photo) => !broken.has(photo.src))
      .map((photo) => (notPhotos.has(photo.src) ? { ...photo, banner: true } : photo));
  if (!event.photos?.length) delete event.photos;
  for (const talk of event.talks ?? []) if (talk.video && broken.has(talk.video)) delete talk.video;
}

const inSpanish = (value: string | undefined) => (value && overrides.spanish?.[value]) || value;
for (const event of events) {
  event.attendance = inSpanish(event.attendance);
  event.venue = inSpanish(event.venue);
  event.city = inSpanish(event.city);
  if (event.organizers) event.organizers = event.organizers.map((name) => inSpanish(name)!);
}

// ---------------------------------------------------------------- organizers

/*
 * Who organized each event, each once, and a profile for each of them (people.json). Meetup's hosts
 * are accounts (a member id, with a photo and a profile page); the researched and catalog lists
 * are names. Joined as one:
 * - a full name, wherever it shows up (two Meetup accounts, a researched list);
 * - a first name alone ("Alfonso"), only if one account goes by it, or if the same event lists the
 *   full name it starts ("Alfonso Frachelle");
 * - a name with a note and the same name with another note or none ("Antel (apoyo)", "Antel").
 * Sources spell names with and without accents ("Martin Loy", "Martín Loy"): the accented spelling
 * wins. A host that is the community's own account says nothing new, so it isn't listed, and
 * neither is a deleted Meetup account ("user 95219722").
 */
type MeetupPeople = {
  members: Record<string, { name: string; url?: string; photo?: string | null }>;
  leaders: Record<string, { id: string; role: string }[]>;
};
const meetupPeople: MeetupPeople = existsSync(path.join(RAW, "meetup/people.json"))
  ? readJson<MeetupPeople>("meetup/people.json")
  : { members: {}, leaders: {} };
const ROLE: Record<string, NonNullable<TimelinePerson["roles"]>[number]["role"]> = {
  ORGANIZER: "organizer",
  COORGANIZER: "coorganizer",
  ASST_ORGANIZER: "assistant",
  EVENT_ORGANIZER: "events",
};

const accents = (name: string) => name.normalize("NFD").length - name.length;
const withoutNote = (name: string) => name.replace(/\s*\([^)]*\)/g, "").trim();
const accented = new Map<string, string>();
// The accounts behind each first name
const accountsOf = new Map<string, Set<string>>();
for (const event of events) {
  for (const name of [...(event.organizers ?? []), ...(event.hosts ?? []).map((host) => host.name)]) {
    const known = accented.get(slugify(name));
    if (!known || accents(name) > accents(known)) accented.set(slugify(name), name.trim());
  }
  for (const host of event.hosts ?? [])
    accountsOf.set(slugify(host.name), new Set([...(accountsOf.get(slugify(host.name)) ?? []), host.id]));
}
const spelled = (name: string) => {
  // A group's team today may never have hosted: their name shows up only there
  const best = accented.get(slugify(name)) ?? name.trim();
  return accents(best) > accents(name) ? best : name.trim();
};
const keyOf = (name: string, member?: string) => {
  const key = slugify(withoutNote(name)) || slugify(name);
  return member && !key.includes("-") && (accountsOf.get(key)?.size ?? 0) > 1 ? `${key}-meetup-${member}` : key;
};

type Entry = { key: string; name: string; member?: string; aliased?: boolean };
const entriesOf = new Map<Candidate, Entry[]>();
const alias = new Map<string, string | null>();
for (const event of events) {
  const own = [event.community, slugify(communities.get(event.community)?.name ?? "")];
  const entries: Entry[] = [
    ...(event.organizers ?? []).map((name) => ({ key: keyOf(name), name })),
    ...(event.hosts ?? [])
      .filter((host) => !own.includes(slugify(host.name)) && !/^user \d+$/i.test(host.name))
      .map((host) => ({ key: keyOf(host.name, host.id), name: host.name, member: host.id })),
  ].filter((entry) => entry.key);
  // A first name next to the one full name it starts, here: the same person, at every event
  for (const entry of entries) {
    const word = slugify(withoutNote(entry.name));
    if (word.includes("-")) continue;
    const full = [
      ...new Set(
        entries
          .filter((other) => other.key.startsWith(`${word}-`) && !other.key.includes("-meetup-"))
          .map((other) => other.key)
      ),
    ];
    if (full.length !== 1) continue;
    alias.set(entry.key, alias.has(entry.key) && alias.get(entry.key) !== full[0] ? null : full[0]);
  }
  entriesOf.set(event, entries);
}

type Person = {
  key: string;
  names: string[];
  members: string[];
  events: Candidate[];
  /** The event of each talk they gave */
  talks: Candidate[];
  roles: TimelinePerson["roles"];
};
const persons = new Map<string, Person>();
const personOf = (key: string) => {
  let person = persons.get(key);
  if (!person) persons.set(key, (person = { key, names: [], members: [], events: [], talks: [], roles: [] }));
  return person;
};
const memberKey = new Map<string, string>();
for (const [event, entries] of entriesOf) {
  const seen = new Set<string>();
  const kept: Entry[] = [];
  for (const entry of entries) {
    const key = alias.get(entry.key) ?? entry.key;
    const person = personOf(key);
    // The account counts even when the event already named its person (a researched list first)
    if (entry.member) memberKey.set(entry.member, key);
    if (entry.member && !person.members.includes(entry.member)) person.members.push(entry.member);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ ...entry, key, aliased: key !== entry.key });
    person.names.push(entry.name);
    person.events.push(event);
  }
  entriesOf.set(event, kept);
}
// Each live group's team today, whether or not they hosted an event
for (const [urlname, team] of Object.entries(meetupPeople.leaders)) {
  const community = communityOfGroup.get(urlname);
  const member = (id: string) => meetupPeople.members[id];
  if (!community) continue;
  for (const { id, role } of team) {
    if (!member(id)) continue;
    const key = memberKey.get(id) ?? alias.get(keyOf(member(id).name, id)) ?? keyOf(member(id).name, id);
    const person = personOf(key);
    if (!person.names.length) person.names.push(member(id).name);
    if (!person.members.includes(id)) person.members.push(id);
    if (ROLE[role] && !person.roles!.some((r) => r.community === community))
      person.roles!.push({ community, role: ROLE[role] });
  }
}

/*
 * Speakers: the same people, by the same names. "A & B" is two people, "Name (Company)" and
 * "Name - Company" are Name. A first name alone is someone only when the same event names one
 * person it starts ("Santiago" next to "Santiago Ferreira"); a group of people ("Alumnos de…"),
 * a company or a handle ("IBM", "elcuervo") stays a name without a profile.
 */
const NOT_A_PERSON = /^(varios|alumnos|docentes|maestros|estudiantes|equipo)\b/i;
const speakerName = (name: string) =>
  withoutNote(name)
    .replace(/\s+[-–]\s+.*$/, "")
    .trim();
const speakersOf = (talk: RawTalk) =>
  (talk.speakers ?? [])
    .flatMap((name) => name.split(/\s+&\s+/))
    .map((name) => name.trim())
    // A placeholder the source left
    .filter((name) => name && !/^(todo|tbd)$/i.test(name));
const speakerKeys = new Map<RawTalk, (string | undefined)[]>();
for (const event of events) {
  const fullKeys = new Set([
    ...(entriesOf.get(event) ?? [])
      .map((entry) => entry.key)
      .filter((key) => key.includes("-") && !key.includes("-meetup-")),
    ...(event.talks ?? [])
      .flatMap(speakersOf)
      .map((name) => slugify(speakerName(name)))
      .filter((key) => key.includes("-")),
  ]);
  for (const talk of event.talks ?? []) {
    const keys = speakersOf(talk).map((name) => {
      const key = slugify(speakerName(name));
      if (!key || NOT_A_PERSON.test(name)) return undefined;
      if (key.includes("-")) return key;
      const full = [...fullKeys].filter((other) => other.startsWith(`${key}-`));
      return full.length === 1 ? full[0] : undefined;
    });
    speakerKeys.set(talk, keys);
    speakersOf(talk).forEach((name, i) => {
      if (!keys[i]) return;
      const person = personOf(keys[i]);
      person.names.push(speakerName(name));
      person.talks.push(event);
    });
  }
}

// The name a profile goes by: without a note, the fullest, accented, the most used. Named only
// with notes, and different ones ("Cubox (apoyo)", "Cubox (Gabriela Rodríguez…)"), it's the name alone
const nameOf = (person: Person) => {
  const variants = new Set(person.names.map(spelled));
  if (variants.size > 1 && [...variants].every((name) => name !== withoutNote(name)))
    return withoutNote([...variants][0]);
  const counts = new Map<string, number>();
  for (const name of person.names) counts.set(spelled(name), (counts.get(spelled(name)) ?? 0) + 1);
  const words = (name: string) => withoutNote(name).split(/\s+/).length;
  return [...counts].sort(
    ([a, x], [b, y]) =>
      Number(a !== withoutNote(a)) - Number(b !== withoutNote(b)) ||
      words(b) - words(a) ||
      accents(b) - accents(a) ||
      y - x
  )[0][0];
};
const hiddenPeople = new Set(overrides.people?.hide);
const noPhoto = new Set(overrides.people?.noPhoto);
// A takedown names a profile by its slug, its Meetup profile URL, or both: the URL still matches
// after a renamed account moves the slug. The entries that matched someone, to flag the ones that didn't
const matched = new Set<string>();
const takenDown = (list: Set<string>, slug: string, person: Person) => {
  const hits = [slug, ...person.members.map((id) => meetupPeople.members[id]?.url)].filter(
    (key): key is string => !!key && list.has(key)
  );
  for (const key of hits) matched.add(key);
  return hits.length > 0;
};
const profiles = new Map<string, TimelinePerson>();
const slugOfPerson = new Map<string, string>();
const ranked = [...persons.values()].sort(
  (a, b) =>
    b.events.length + b.talks.length - (a.events.length + a.talks.length) ||
    (a.events[0]?.start ?? a.talks[0]?.start ?? "9").localeCompare(b.events[0]?.start ?? b.talks[0]?.start ?? "9") ||
    a.key.localeCompare(b.key)
);
for (const person of ranked) {
  const name = nameOf(person);
  const base = slugify(withoutNote(name)) || person.key;
  let slug = base;
  for (let n = 2; profiles.has(slug) || hiddenPeople.has(slug); n++) slug = `${base}-${n}`;
  slugOfPerson.set(person.key, slug);
  if (takenDown(hiddenPeople, base, person)) continue;
  const account = person.members.map((id) => meetupPeople.members[id]).find((member) => member?.photo);
  // Organized or spoke at, each event once
  const own = [...new Set([...person.events, ...person.talks])].sort((a, b) => a.start.localeCompare(b.start));
  const counts = new Map<string, number>();
  for (const event of own) counts.set(event.community, (counts.get(event.community) ?? 0) + 1);
  profiles.set(slug, {
    slug,
    name,
    photo:
      takenDown(noPhoto, slug, person) || broken.has(account?.photo ?? "") ? undefined : (account?.photo ?? undefined),
    meetup: (account ?? meetupPeople.members[person.members[0]])?.url,
    events: person.events.length,
    talks: person.talks.length || undefined,
    first: own[0]?.start.slice(0, 10),
    last: own.at(-1)?.start.slice(0, 10),
    communities: [...counts].sort((a, b) => b[1] - a[1]).map(([community]) => community),
    roles: person.roles?.length ? person.roles : undefined,
  });
}
for (const entry of [...hiddenPeople, ...noPhoto])
  if (!matched.has(entry))
    console.warn(
      `overrides.json people: "${entry}" matches no one (a typo, or a slug that moved: name their Meetup profile URL too)`
    );
const organizersOf = new Map<Candidate, TimelineEvent["organizers"]>();
for (const [event, entries] of entriesOf) {
  const list = entries
    .map((entry) => ({
      name: entry.aliased ? profiles.get(slugOfPerson.get(entry.key)!)?.name : spelled(entry.name),
      person: slugOfPerson.get(entry.key)!,
    }))
    .filter(
      (organizer): organizer is { name: string; person: string } => profiles.has(organizer.person) && !!organizer.name
    );
  organizersOf.set(event, list.length ? list : undefined);
}

// ---------------------------------------------------------------- slugs, stats, write

events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
// Each event's URL as already published: a title edited on Meetup doesn't move it
const published = new Map<string, string>();
for (const file of existsSync(path.join(OUT, "events")) ? readdirSync(path.join(OUT, "events")) : [])
  for (const event of JSON.parse(readFileSync(path.join(OUT, "events", file), "utf8")) as TimelineEvent[])
    for (const id of [event.id, ...(event.mergedIds ?? [])]) published.set(id, event.slug);
const slugs = new Set<string>();
for (const event of events) {
  const kept = [event.id, ...(event.mergedIds ?? [])].map((id) => published.get(id)).find(Boolean);
  if (kept && !slugs.has(kept)) {
    slugs.add(kept);
    event.slug = kept;
    continue;
  }
}
for (const event of events) {
  if (event.slug) continue;
  const base = `${dayOf(event.start).replace(/-$/, "")}-${slugify(event.title).slice(0, 60).replace(/-+$/, "")}`;
  let slug = base;
  if (slugs.has(slug)) slug = `${base}-${event.community}`;
  for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
  slugs.add(slug);
  event.slug = slug;
}

for (const community of communities.values()) {
  const own = events.filter((e) => e.community === community.slug && e.kind !== "hito");
  community.events = own.length;
  community.first = own[0]?.start.slice(0, 10);
  community.last = own.at(-1)?.start.slice(0, 10);
  community.photos = own.reduce((sum, e) => sum + Math.max(e.photos?.length ?? 0, e.photoCount ?? 0), 0);
  // A series with an edition in the last two years is still running
  if (community.kind === "serie" && community.last && community.last >= `${now.getFullYear() - 2}`)
    community.status = "activa";
}
for (const [slug, community] of communities) {
  if (DISPLAY_NAME[slug]) community.name = DISPLAY_NAME[slug];
  if (!community.events && slug !== "hitos") communities.delete(slug);
  if (overrides.layer?.[slug]) community.layer = overrides.layer[slug];
}

const lines = (rows: unknown[]) => `[\n${rows.map((row) => JSON.stringify(row)).join(",\n")}\n]\n`;
rmSync(path.join(OUT, "events"), { recursive: true, force: true });
mkdirSync(path.join(OUT, "events"), { recursive: true });
const years = new Map<string, TimelineEvent[]>();
for (const candidate of events) {
  const { origin: _origin, hosts: _hosts, organizers: _names, ...rest } = candidate;
  const event: TimelineEvent = {
    ...rest,
    // Replaced where they were, so each file keeps its order
    talks: rest.talks?.map((talk) => ({
      ...talk,
      speakers: speakersOf(talk).length
        ? speakersOf(talk).map((name, i) => {
            const slug = slugOfPerson.get(speakerKeys.get(talk)?.[i] ?? "");
            return slug && profiles.has(slug) ? { name, person: slug } : { name };
          })
        : undefined,
    })),
    organizers: organizersOf.get(candidate),
  };
  const year = event.start.slice(0, 4);
  years.set(year, [...(years.get(year) ?? []), event]);
}
for (const [year, rows] of years) writeFileSync(path.join(OUT, "events", `${year}.json`), lines(rows));
writeFileSync(
  path.join(OUT, "communities.json"),
  lines(
    [...communities.values()].sort(
      (a, b) => (a.first ?? "9").localeCompare(b.first ?? "9") || a.name.localeCompare(b.name, "es")
    )
  )
);
for (const profile of profiles.values()) {
  profile.roles = profile.roles?.filter((role) => communities.has(role.community));
  if (!profile.roles?.length) delete profile.roles;
}
writeFileSync(path.join(OUT, "people.json"), lines([...profiles.values()]));

const photoTotal = events.reduce((sum, e) => sum + (e.photos?.length ?? 0), 0);
console.log(
  `✓ ${events.length} events (${candidates.length} candidates) · ${communities.size} communities · ${profiles.size} people · ${photoTotal} photos · ${years.size} years → ${path.relative(process.cwd(), OUT)}`
);
