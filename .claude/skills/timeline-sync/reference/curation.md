# Curation: the calls a script can't make

## Contents

- New Meetup groups
- Conference editions
- Milestones
- The story rail
- Enrichment
- Takedown requests
- Corrections
- Writing for the site

Every change here ends with `pnpm timeline:build` and `pnpm timeline:check`.

## New Meetup groups

`pnpm timeline:sync --discover` lists Uruguay groups on Meetup that the sources don't have. Open
each one's page (`https://www.meetup.com/<urlname>/`) when the name doesn't settle it, then:

| Flag         | When                                                                                                                                                                                             | Examples                                                           |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- |
| `tech`       | Run by and for a community of people who build technology: a language, framework, discipline (data, AI, security, testing, UX, agile, DevOps), or a group like Women in Tech                     | Montevideo JS, Python Montevideo, OWASP Uruguay, AgileUY, PyLadies |
| `borderline` | Tech-adjacent or run by a company: a vendor's or employer's talk series, crypto/web3 promotion, startups and entrepreneurship, "AI for business/marketing", re-posts of another network's events | Mercado Libre Tech Talks, 1950Labs Tech Talks, web3 meetups        |
| `no`         | Not about technology, or not in Uruguay, or empty (no past events and no description)                                                                                                            | Language exchange, business networking, a group in Buenos Aires    |

Borderline groups show in the ecosystem layer (off by default in the archive). When unsure between
`tech` and `borderline`, ask the user.

**Same community, new group.** Communities move to a new Meetup group (GDG Montevideo has two). If
a new group is an existing community, add it with `--add <urlname>=tech` _and_ map it in
`overrides.json` `groupCommunity` (`"<urlname lowercased>": "<community slug>"`); its events join
the existing community's lane. If the community is in OWU's directory (`content/communities/`),
setting its "Página de eventos" to the Meetup URL does the same.

## Conference editions

Anything not on Meetup (conferences, hackathons, game jams, workshops, FLISoL, DevFest…) lives in
`scripts/timeline/sources/conferences/editions.json`, one entry per edition:

```json
{
  "series": "JSConf Uruguay",
  "series_slug": "jsconfuy",
  "category": "conference",
  "edition": "1st",
  "year": 2014,
  "start_date": "2014-03-14",
  "end_date": "2014-03-15",
  "city": "Montevideo",
  "venue": "Torre de las Telecomunicaciones",
  "organizers": ["Santiago Ferreira", "Pablo Dejuan"],
  "attendees": 200,
  "talks": 24,
  "official_url": "https://2014.jsconf.uy/",
  "url_alive": false,
  "wayback_url": "https://web.archive.org/web/20140316/http://jsconf.uy/",
  "photos": [
    {
      "url": "https://www.flickr.com/photos/jsconfuy/albums/72157642388178434",
      "kind": "flickr-album",
      "license": "CC BY-SA 2.0"
    }
  ],
  "videos": [{ "url": "https://www.youtube.com/playlist?list=…", "kind": "youtube-playlist" }],
  "confidence": "high",
  "date_source": "https://…"
}
```

- `series_slug` decides the community: reuse an existing series' slug for a new edition. A series a
  community runs goes in `SERIES_COMMUNITY` (build.ts); a vendor's or an institution's in
  `ECOSYSTEM_SERIES`.
- `category`: `conference`, `hackathon`, `game-jam`, `workshop`; `vendor-conference`,
  `institutional` and `graduation` land in the ecosystem layer.
- `start_date` `YYYY-MM-DD` (or `YYYY-MM`, `YYYY` when that's all the sources say). Editions up to
  120 days ahead show as upcoming; build again after they happen.
- `attendees`: a number, or the source's words. `talks`: a count only.
- `photos`: a Flickr album URL expands to its photos; a direct image URL is a photo; any other URL
  becomes a "Fotos" link. `videos` become "Videos" links (talk-level videos go in enrichment).
- `confidence`: `high` (official site or several sources agree), `medium`, `low`. `date_source`:
  where the date came from.
- **Never change an existing entry's `start_date` or `series_slug`**: they make the event's id, and
  the published URL hangs on it. Correct a date with `overrides.json` `fix` keyed by the event id
  (`conf:<series_slug>:<start_date>`).

Research: the official site (or its Wayback capture), the organizers' posts, press, Flickr and
YouTube. Two sources for a date; say when there's only one (`confidence: "medium"`).

## Milestones

`content/timeline/hitos.json`, in Spanish: things that changed the scene, not events.

```json
{
  "date": "2014-03-14",
  "type": "first",
  "community": "jsconfuy",
  "title": "Primera JSConf Uruguay",
  "description": "…",
  "layer": "community",
  "source": "https://…"
}
```

- `type`: `first` (a series' first edition), `founding` (a community starts), `ended`, `rename`, `other`.
- `community`: a community slug, or `hitos` for the scene at large. A milestone on an event's day
  becomes that event's highlight instead of its own entry.
- `date`: `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. Its id is the date plus the title: once published,
  don't edit either (add a `fix` instead).
- Always a `source`.

## The story rail

`content/timeline/story.json`: one entry per year, the short story under each year on /timeline.

```json
{
  "year": 2026,
  "lines": [["La Meetup pasa a llamarse ", ["OWU CONF", "2026-11-07-owu-conf-2026"], ": 7 de noviembre."]],
  "photos": [{ "event": "2026-04-24-flisol-uruguay-2026", "n": 0 }],
  "badges": ["pyladies-uruguay"]
}
```

- `lines`: two to four, each text and `[label, event slug]` links. The year's biggest firsts,
  returns and endings; not a list of events.
- `photos`: up to two, `{event slug, photo index}`; pick real photos of people (not flyers).
- `badges`: community slugs whose logo shows on the year.
- A new year: draft it from the year's milestones and biggest events, and show the user before
  committing. The check fails on any link to a slug that doesn't exist.

## Enrichment

`content/timeline/enrichment/<batch>.json`, keyed by event id, for events their source barely
describes. Research it, then write:

```json
{
  "conf:rubyconf-uy:2010-10-29": {
    "description": "La primera **RubyConf Uruguay** fue…",
    "talks": [
      { "title": "…", "speakers": ["Ana Pérez"], "slides": "https://…", "video": "https://www.youtube.com/watch?v=…" }
    ],
    "venue": "…",
    "city": "Montevideo",
    "attendance": "unas 300 personas",
    "organizers": ["…"],
    "photos": [
      { "src": "https://…", "page": "https://…", "by": "…", "source": "Flickr", "license": "CC BY 2.0", "alt": "…" }
    ],
    "links": [{ "label": "…", "url": "https://…" }],
    "sources": [{ "label": "…", "url": "https://…" }]
  }
}
```

- `description` becomes the event's summary ("Qué fue"): Markdown, Spanish, written from the
  sources, 60–150 words, no superlatives.
- Researched `venue`, `city`, `attendance` and `organizers` replace the source's; the rest fills gaps.
- A photo whose `alt` says flyer, banner, logo, captura… becomes a banner automatically.
- `sources` is required: every fact traceable.
- Event ids: `meetup:<id>`, `conf:<series_slug>:<start_date>`, `github:<repo>:<date>:<slug>` (look
  them up in `content/timeline/events/`).

## Takedown requests

Someone asks (usually to the privacy email) to remove themselves or a photo. Do it before anything
else, don't argue the request, and ship it on its own (below). Every page promises it within 72 hours.

The site's "Pedí que lo saquemos" links prefill the mail: `Página: https://www.owu.uy/timeline/…`
names the page, and from a photo's viewer `Foto: <url>` names the photo. That URL is the photo's
`src` as published (an `overrides.json` `hidePhotos` entry as is), except from the story rail,
where it's a resized copy: match it to the event's photo by its Meetup or Flickr id.

**1. Find what to name.** A profile is named by its slug (the end of `/timeline/personas/<slug>`)
**and** its Meetup profile URL (its `meetup` field), both: the URL keeps matching if a renamed
account moves the slug. Find them with `grep -i '<name>' content/timeline/people.json`. A photo is
named by its URL exactly as in `content/timeline/events/<year>.json` (`photos[].src`).

**2. Add it to `content/timeline/overrides.json`** (create the keys if they aren't there):

```json
"people": {
  "hide": ["juan-perez", "https://www.meetup.com/members/12345/"],
  "noPhoto": ["ana-gomez", "https://www.meetup.com/members/67890/"]
},
"hidePhotos": ["https://secure.meetupstatic.com/photos/event/…/highres_123.jpeg"],
"hide": ["meetup:301234567"]
```

| They ask to remove  | Key               | What's left                                                           |
| :------------------ | :---------------- | :-------------------------------------------------------------------- |
| Their profile       | `people.hide`     | Nothing: the page goes and their name leaves every event              |
| Their profile photo | `people.noPhoto`  | The page, with their initials; it still links to their Meetup profile |
| A photo they're in  | `hidePhotos`      | The event, without that photo                                         |
| An event            | `hide` (event id) | Nothing                                                               |

Add the entry even when the photo already doesn't show (listed in `broken-photos.json`): a broken
photo comes back when it loads again, and the sync refreshes everyone's Meetup photo.

**3. Build and check.** The build warns about any entry that matches no one; the check fails on a
takedown that isn't in effect and prints "Takedowns in effect: …". A hidden profile or event that
was published shows as a warning ("hidden in overrides.json"): expected.

**4. Ship it alone**: a branch from `main` with only `overrides.json` and the dataset the build
rewrote, not mixed with a sync. Tell the user what was removed and what's left (the table's last
column), that it leaves the site with the next deploy, and offer the requester the rest: a
profile-photo request may also want the event photos they're in hidden, or the whole profile.

## Corrections

- A wrong date or title from a source: `overrides.json` `fix` (`"<event id>": {"start": "…",
  "end": "…", "title": "…"}`).
- An event that isn't real, or isn't the community's: `overrides.json` `hide`.
- A group under the wrong community, or the wrong layer: `groupCommunity`, `layer`.
- A catalog note in English shown on the site: add its Spanish to `overrides.json` `spanish`.
- Two names of one place that didn't join: `VENUE_ALIASES` in `src/lib/timeline/venues.ts`.

## Writing for the site

Spanish from Uruguay: voseo, "setiembre", short sentences, plain words, no exclamations. Dates and
numbers as the site formats them (the build and the pages do it; don't pre-format). Names as people
write them, with their accents.
