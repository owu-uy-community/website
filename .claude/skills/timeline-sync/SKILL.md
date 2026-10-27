---
name: timeline-sync
description: Updates OWU's /timeline history (the dataset in content/timeline) from its sources and keeps it healthy. Pulls new and recent Meetup events, album photos, hosts, teams and community sizes; finds new Uruguay tech groups; checks every picture still loads and drops the broken ones; rebuilds; verifies no page or published URL broke. Use when asked to update, sync or refresh the timeline, historia or archivo; to add a community, a conference edition or a milestone to it; to fix broken timeline photos; to handle a takedown request for a person or photo; or before shipping changes to content/timeline or scripts/timeline.
argument-hint: "[what to do; empty = full update]"
allowed-tools: Read Grep Glob Bash(pnpm timeline*) Bash(git status *) Bash(git log *) Bash(git diff *)
---

# Timeline sync

The history at /timeline is built from **sources** (`scripts/timeline/sources/`, what was harvested)
plus **curated files** (`content/timeline/*.json`, what people decided) into the **dataset**
(`content/timeline/events/*.json`, `communities.json`, `people.json`), which the site reads.
Never edit the dataset by hand: change a source or a curated file, then build.

Task: $ARGUMENTS

## State

- Sources last committed: !`git log -1 --format=%cr -- scripts/timeline/sources`
- Uncommitted timeline changes:
  !`git status --short content/timeline scripts/timeline`

## Commands

Run these, don't read them. Each prints what it did and what to run next.

| Command                                                   | What it does                                                                                                                                     |
| :-------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm timeline:sync`                                      | Meetup → sources: each live group's new and recent events, albums, hosts, team, size and rating; every host's current name and photo. ~1 minute. |
| `pnpm timeline:sync --discover`                           | Same, plus Uruguay groups on Meetup that aren't in the sources yet (~2 more minutes).                                                            |
| `pnpm timeline:sync --add <urlname>=tech\|borderline\|no` | Lists a new group and harvests all its events. Repeatable.                                                                                       |
| `pnpm timeline:sync --group <urlname> [--full]`           | One group; `--full` refetches its whole history.                                                                                                 |
| `pnpm timeline:build`                                     | Sources + curated files → dataset. Offline, seconds. Keeps every published event URL.                                                            |
| `pnpm timeline:photos [--sample 400]`                     | Checks every picture still loads; updates `content/timeline/broken-photos.json`. A few minutes in full.                                          |
| `pnpm timeline:check`                                     | Integrity and published-URL check against `HEAD`; lists what's new. Exit 1 on errors.                                                            |
| `pnpm timeline:map <geojson>`                             | Redraws the map outlines. Only if the map itself must change.                                                                                    |

## Full update

Copy this checklist and tick it off:

```
Timeline update:
- [ ] 1. pnpm timeline:sync (with --discover if asked about new groups, or monthly)
- [ ] 2. Classify any discovered groups; --add them
- [ ] 3. Curate what the sync can't know (only when the task calls for it)
- [ ] 4. pnpm timeline:build
- [ ] 5. pnpm timeline:photos, then build again if broken-photos.json changed
- [ ] 6. pnpm timeline:check until it reports no errors
- [ ] 7. Review the diff and report
```

**1. Sync.** Read its summary: new, cancelled and updated events; renamed groups; groups gone from
Meetup. A group Meetup didn't answer for is kept as it was; run it again later with `--group`.
If the whole sync fails on network errors, retry once; Meetup is otherwise reliable.

**2. New groups.** For each group `--discover` lists, decide tech, borderline or no with the rubric in
[reference/curation.md](reference/curation.md#new-meetup-groups), and add them all in one call:
`pnpm timeline:sync --add a=tech --add b=no`. Record "no" too, so it isn't listed again. A new
group that is an existing community under another name needs a mapping, not just `--add` (same file).

**3. Curate.** Only what the task asks for, or what the sync's report makes necessary:

- A conference edition, a hackathon, anything not on Meetup → [reference/curation.md](reference/curation.md#conference-editions)
- A first, a founding, a closure, a rename → milestone in `hitos.json` (same file, "Milestones")
- A new year, or a year whose story changed → `story.json` (same file, "The story rail")
- An event with no description or photos worth researching → enrichment (same file, "Enrichment")
- A takedown request → [reference/curation.md](reference/curation.md#takedown-requests). Do these first, before anything else.

**4. Build.** It prints one line with the counts. A warning about an enrichment id with no event
means the event's id changed or it was hidden: fix the id in the enrichment file.

**5. Pictures.** `pnpm timeline:photos` lists what's newly gone and what loads again. Gone pictures
leave events and profiles at the next build; nothing else to do. "Couldn't tell" (timeouts, server
errors) is never listed: if one host has many, it's down, not gone; check again another day.

**6. Check.** Fix every error, build, check again. Common errors and their fix:

- _An event URL was published and is gone_: the event left the sources (a Meetup event that was
  cancelled after the fact) or got hidden. If it was hidden on purpose, add its id to
  `overrides.json` `hide` (it becomes a warning). Otherwise find out why before going on.
- _A profile URL was published and is gone_: a person's name changed or merged with another. When
  the check names where it moved, it's a warning and fine. Otherwise investigate the names in
  `scripts/timeline/sources/meetup/events.json` hosts and the identity rules in
  [reference/sources.md](reference/sources.md#people).
- _story.json links to something that doesn't exist_: an event's slug changed or it left. Point the
  link at the right slug (`grep` the title in `content/timeline/events/`).
- _Code names a slug that doesn't exist_ (`page.tsx` mosaic, `data.ts` own photos): same fix there.

**7. Report.** Summarize for the user: new events (by community), new people, photos added and
dropped, groups added, renamed or gone, anything left undone and why. Show `git diff --stat`.
Commit only when asked; then use a branch and a message like
`chore(timeline): sync Meetup through <last event date>`, and spot-check two or three changed
pages on the pull request's preview.

## Single tasks

- **"Fix broken photos"**: steps 5, 6, 7.
- **"Add <group> to the timeline"**: find its Meetup urlname, then `--add`, build, check, report.
- **"Add <conference> <year>"**: research it, add the edition (curation.md), build, check.
- **"Is the timeline OK?"**: `pnpm timeline:check`, then `pnpm timeline:photos --sample 400`.

## Rules

- Hotlink, never host: photos are shown from where they're published (Meetup, Flickr, GitHub, the
  Wayback Machine). Don't download or upload pictures.
- Only what's public and about the events. Meetup also returns members' bios, cities and who
  signed up to each event: never store or show those.
- Copy shown on the site is Spanish from Uruguay (voseo, "setiembre"), short and plain.
- Published URLs are permanent. If an event or a profile must go, hide it in `overrides.json`;
  don't let a rebuild drop it silently.

## Reference

- [reference/sources.md](reference/sources.md): every source and curated file, their shapes, and how
  the build joins them (dedupe, people identity, venues, photos). Read before editing a source.
- [reference/curation.md](reference/curation.md): judgment calls: new groups, conference editions,
  milestones, the story rail, enrichment, takedowns.
- [reference/meetup.md](reference/meetup.md): Meetup's public GraphQL as the sync uses it, its
  quirks and limits. Read when a sync fails or needs a field it doesn't fetch.
