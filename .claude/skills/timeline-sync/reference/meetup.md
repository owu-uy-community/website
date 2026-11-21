# Meetup's public GraphQL, as the sync uses it

## Contents

- Endpoints
- What the sync asks
- Quirks
- Limits and errors
- What not to use

## Endpoints

- `POST https://api.meetup.com/gql-ext`: the public API. No login for public data. Groups, events,
  hosts, teams, stats, search.
- `POST https://www.meetup.com/gql2`: the website's own GraphQL, also without login. Only used for
  album photos, which gql-ext doesn't list.

Both take `{ "query": "…", "variables": {…} }`. Introspection works on gql-ext
(`{ __type(name: "Event") { fields { name } } }`) when a field is needed that the sync doesn't fetch.

## What the sync asks

- **A group, its team, its stats and a window of events**, in one query:
  `groupByUrlname(urlname)` → `id urlname name status link foundedDate`,
  `stats { memberCounts { all } eventRatings { average totalRatings } }`,
  `memberships(first: 50, filter: { status: [LEADER] }) { edges { node { … } metadata { role } } }`,
  `events(status: PAST, sort: ASC, first: 50, after, filter: { afterDateTime })` (paged) and
  `events(status: ACTIVE)` (upcoming).
- **Event fields**: `id title dateTime endTime eventUrl status eventType description rsvps { totalCount }
  featuredEventPhoto { highResUrl } displayPhoto { highResUrl } photoAlbum { photoCount }
  venues { name city country lat lon } eventHosts { name member { id } }`.
- **Album photos** (gql2): `event(id) { photoAlbum { photoSample(number: N) { highResUrl } } }`, eight
  events per request; asking for more than the album holds returns all of it.
- **Hosts' current profile**: there's no `member(id)` query. Each member is asked through the latest
  event they hosted: `eN: event(id: "…") { eventHosts { member { id name memberUrl memberPhoto {
  highResUrl } } } }`, forty aliases per request.
- **Search** (`--discover`): `groupSearch(filter: { query, lat, lon, radius, country }, first: 50)`,
  kept when `country` is `uy`.

## Quirks

- A group's `status`: `PAID` or `GRACE` is alive. Anything else (`BLOCKED`, `INACTIVE`…) is gone, and
  `groupByUrlname` stops finding it: its urlname becomes a UUID. `event(id) { group { … } }` still
  answers for its events, which is how the sync tells "renamed" from "gone".
- Event pages of a gone group 404; the sync then points them at the Wayback Machine
  (`waybackUrl`).
- Online events carry a placeholder venue ("Online event", lat −8.52, lon 179.19): `eventType` is
  what tells online apart. The build only pins venues whose `country` is `uy`.
- `photoAlbum.photoCount` can exceed what `photoSample` returns (photos removed or private): the
  sync lists an album again only when its count changes.
- A host's `name` sometimes comes back empty; their member id carries it from another event.
- `displayPhoto` without a `featuredEventPhoto` is often the group's default image: used on 3+
  events, it's marked `isGroupDefault` and not shown as the event's.
- Photo CDN (`secure.meetupstatic.com`): any size of a photo is its URL with the size prefix
  swapped (`highres_`, `600_`, `member_` 240 px, `thumb_` 80 px) and any extension, `.webp`
  included. A removed photo answers **403**, not 404.

## Limits and errors

- One request at a time with 400 ms between them never hit a rate limit (about 6,000 requests in
  the first harvest). On 429 or 5xx the sync waits (`Retry-After`, or 3 s doubling) and retries six
  times.
- Aliased queries over ~50 events at once fail on query cost; the sync stays at 40.
- A GraphQL error with no `data` fails the request; with partial `data`, the parts that answered
  are used.

## What not to use

These answer without login but stay out of the timeline: members' `bio`, `city`, `birthday`,
`startDate`; RSVP lists (`rsvps { edges { node { member } } }`, who went); event comments. Only
what's about the events and their organizers' public profile (name, Meetup page, photo).
