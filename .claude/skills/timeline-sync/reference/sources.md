# Sources, curated files and the build

## Contents

- Layout
- Sources (scripts/timeline/sources)
- Curated files (content/timeline)
- The dataset
- How the build joins everything
- People
- Places
- Photos
- Code that names data

## Layout

```
scripts/timeline/
  sources/            what was harvested; the sync rewrites meetup/, the rest changes by hand
    meetup/           groups.json, events.json, people.json, group-stats.json
    conferences/      editions.json   (the conference catalog)
    github/           events-<owner>__<repo>.json   (community archives found on GitHub)
    flickr/           <album id>.json   (Flickr albums expanded to photo URLs, a build cache)
  build.ts  sync.ts  photos.ts  check.ts  map.ts
content/timeline/     curated files + the dataset the site reads (shipped with every function)
src/lib/timeline/     types.ts (every shape), data.ts, people.ts, venues.ts, stats.ts, image.ts
```

Every JSON list is one record per line, so diffs read event by event. Keep it that way when editing
by hand (the scripts rewrite their own files in that format).

## Sources (scripts/timeline/sources)

**meetup/groups.json** — every Meetup group ever considered, written by the sync:
`{ id, urlname, currentUrlname?, requestedAs?, name, status, activity, flag, link, foundedDate, members, pastEvents, lastEvent }`.

- `activity`: `active` (an event in the last 365 days or one upcoming), `dormant`, or `dead` (gone
  from Meetup; its events stay, pointing at the Wayback Machine). The sync recomputes it.
- `flag.tech`: `tech` → a community; `borderline` → the ecosystem layer; `no` → ignored (kept so
  `--discover` stops listing it). `flag.name` overrides the group's display name.
- `currentUrlname`: what Meetup calls it today when it was renamed; `urlname` stays the key used
  everywhere else (events' `group`, mappings).

**meetup/events.json** — every event of every group: `{ id, group, title, dateTime, endTime,
status (PAST|ACTIVE…), eventType (PHYSICAL|ONLINE|HYBRID), eventUrl, waybackUrl?, venue{ name, city,
country, lat, lon }, rsvps, featuredPhoto, displayPhoto, photoAlbum{ photoCount, photos[] }, hosts[{ id,
name }], description }`. Only `PAST` events reach the site. `displayPhoto.isGroupDefault` marks the
group's image reused on 3+ events (not the event's own).

**meetup/people.json** — `{ members: { <member id>: { name, url, photo } }, leaders: { <urlname>:
[{ id, role }] } }`: every host's and team member's name, profile and photo as of the last sync, and
each live group's team (`ORGANIZER`, `COORGANIZER`, `ASST_ORGANIZER`, `EVENT_ORGANIZER`).

**meetup/group-stats.json** — `{ <urlname>: { members, rating, ratings } }`: size, and the average of
its events' ratings over how many.

**conferences/editions.json** — one entry per edition of a conference, hackathon, jam or workshop
series, researched by hand (see curation.md). Shape: the `Edition` type at the top of build.ts.

**github/events-\*.json** — events extracted from community archives on GitHub (OWASP Uruguay, Ruby
UY, TechMeetup, Ember, R-Ladies…). Static: the archives stopped. Shape: `GithubEvent` in build.ts.

**flickr/** — cache. The build expands a Flickr album link into photo URLs once and saves it here.
Delete a file to refetch that album.

## Curated files (content/timeline)

| File                 | What it is                                                                                                                                                                                                                                                                                                                                                  |
| :------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides.json`     | Corrections: `hide` (event ids that never render), `fix` (id → corrected `start`/`end`/`title`), `groupCommunity` (Meetup urlname → community slug), `layer` (community slug → layer), `photos` (id → extra photos), `spanish` (catalog notes in English → Spanish), `people.hide` / `people.noPhoto` (profile slugs), `hidePhotos` (photo URLs taken down) |
| `hitos.json`         | Milestones, in Spanish: firsts, foundings, endings, renames (curation.md)                                                                                                                                                                                                                                                                                   |
| `story.json`         | The year-by-year rail on /timeline: lines with links to events, photos, badges (curation.md)                                                                                                                                                                                                                                                                |
| `enrichment/*.json`  | Research per event id: a summary written from sources, talks, photos, organizers, venue, attendance, links, sources (curation.md)                                                                                                                                                                                                                           |
| `not-photos.json`    | `{ src: [...] }`: pictures that aren't photos of the event (flyers, logos, slides). Still shown in galleries, never as an event's cover                                                                                                                                                                                                                     |
| `broken-photos.json` | Written by `pnpm timeline:photos`: pictures that stopped loading. Don't edit by hand                                                                                                                                                                                                                                                                        |
| `map.json`           | Map outlines, written by `pnpm timeline:map`                                                                                                                                                                                                                                                                                                                |

## The dataset

`events/<year>.json` (`TimelineEvent`), `communities.json` (`TimelineCommunity`), `people.json`
(`TimelinePerson`): all in `src/lib/timeline/types.ts`. Written only by the build.

## How the build joins everything

In order (`scripts/timeline/build.ts`, sections marked with `// ----`):

1. **Communities**: the OWU directory (Keystatic, `content/communities/`, matched by its Meetup URL),
   then each Meetup group with a flag, then each conference series. Names: `DISPLAY_NAME`; topics:
   `TOPIC_RULES`; a group that's the same community as another: `GROUP_COMMUNITY` or
   `overrides.groupCommunity`; a series run by a community: `SERIES_COMMUNITY`; vendor and
   institutional series: `ECOSYSTEM_SERIES` (ecosystem layer).
2. **Candidates**: Meetup events (past only), GitHub archive events, conference editions, milestones.
3. **Fixes** from `overrides.fix`, applied before merging so a corrected date can meet its twin.
4. **Merge**: same community and same day (or inside a multi-day edition) is one event, unless both
   are distinct Meetup events; a conference also posted on Meetup by another group merges when the
   titles are similar (≥ 0.5). The richest source leads: conference > meetup > github. A milestone on
   an event's day becomes its highlight.
5. **Photos**: `overrides.photos`, enrichment photos; then `not-photos.json` marks banners and
   `broken-photos.json` + `overrides.hidePhotos` remove pictures (and dead talk videos).
6. **Enrichment** fills gaps (summary, talks, photos, links); researched venue, city, attendance and
   organizers replace the source's.
7. **People** (below), then **slugs**: an event keeps the slug it was published with (read from the
   current `events/`); new events get `<date>-<title>`.

## People

A profile (`/timeline/personas/<slug>`) is anyone who organized an event (Meetup hosts, researched
or catalog organizer lists), is on a live group's team, or gave a talk. One person, by these rules:

- A full name is one person across accounts and sources ("Martin Loy" = "Martín Loy"; the spelling
  with more accents wins).
- A single-word name is one person per Meetup account, unless the same event lists exactly one
  full name it starts ("Alfonso" next to "Alfonso Frachelle" is him, everywhere).
- "Name (note)" and "Name - Company" are Name. "A & B" is two speakers.
- Not people: the community's own Meetup account, deleted accounts (`user 12345`), groups ("Alumnos
  de…"), and lone handles or companies as speakers (shown as plain text).
- Slugs come from the name; the busiest person gets the bare slug, namesakes `-2`, `-3`.

A wrong merge or split is fixed at the source of the name: an `enrichment` organizers list, a
`fix`, or hiding the profile. Check `pnpm timeline:check` afterwards: profile URLs are published.

## Places

Computed when the site reads the dataset (`src/lib/timeline/venues.ts`), not by the build: event
`venue` names are joined by `venueKey` ("Oficina de Pyxis" = "Pyxis"; `VENUE_ALIASES` for the
rest). A place with 2+ events gets a page. Its dot is the median of its events' `geo`, which only
Meetup venues in Uruguay have. To join two spellings of a place, add a `VENUE_ALIASES` entry.

## Photos

Shown from where they're published; `src/lib/timeline/image.ts` asks Meetup and Flickr for the size
each screen needs. An event's first photo is its cover unless it's a banner. Meetup: event photos
`photos/event/…/highres_<id>.jpeg`; member photos `photos/member/…`.

## Code that names data

`pnpm timeline:check` verifies these still exist:

- `src/app/(web)/(content)/timeline/page.tsx` `MOSAIC`: the hero's photo tiles (event slug, photo index).
- `src/lib/timeline/data.ts` `OWN_PHOTOS`: OWU's own La Meetup photos, joined to those editions.
- `src/app/(web)/(content)/timeline/stats/StatsSection.tsx` uses fixed years (`BOOM`, `RETURN`) in its copy: revisit them
  when a new year changes the story.
