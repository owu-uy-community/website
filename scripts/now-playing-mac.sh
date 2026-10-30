#!/bin/zsh
# Feeds the wall's "now-playing" scene with whatever the Mac hears, using the
# built-in Shazam recogniser of macOS Shortcuts: no API key, no quota.
#
# One-time setup (Shortcuts app on the Mac next to the speakers):
#   1. New shortcut named "OWU Now Playing" with three actions:
#        - Recognize Music                (Shazam; listens ~10 s on the mic)
#        - Get Details of Shazam Media    → Title   (from "Shazam Media")
#        - Text:                          [Title]
#                                          [Artist]   (add a second "Get Details… → Artist")
#      The Text action is the last one, so its two lines are the shortcut's output.
#   2. Run it once by hand to grant the microphone permission.
#   3. OWU_API_KEY=… OWU_API_URL=https://owu.uy ./scripts/now-playing-mac.sh
#
# It only changes the wall while the "Sonando" (now-playing) scene is on air —
# the site ignores it otherwise — so it can run all day.
#
# Linux box instead of a Mac? SongRec (open-source Shazam client) does the same:
#   songrec listen --json | while read -r line; do …post song/artist…; done

set -u
: "${OWU_API_KEY:?set OWU_API_KEY (pnpm owy:key on the site)}"
API="${OWU_API_URL:-https://owu.uy}/api/orpc/owyStage/nowPlaying"
SHORTCUT="${SHORTCUT_NAME:-OWU Now Playing}"
EVERY="${EVERY_SECONDS:-25}"
OUT=$(mktemp -t owy-now-playing)

while true; do
  : > "$OUT"
  if shortcuts run "$SHORTCUT" --output-type public.plain-text -o "$OUT" 2>/dev/null; then
    title=$(sed -n 1p "$OUT")
    artist=$(sed -n 2p "$OUT")
    if [[ -n "$title" ]]; then
      body=$(python3 -c 'import json,sys; print(json.dumps({"json": {"song": sys.argv[1][:80], "artist": sys.argv[2][:80]}}))' "$title" "$artist")
      curl -s -o /dev/null -X POST "$API" -H "content-type: application/json" -H "x-api-key: $OWU_API_KEY" -d "$body"
      echo "$(date +%H:%M:%S)  $title — $artist"
    else
      echo "$(date +%H:%M:%S)  (no match)"
    fi
  else
    echo "$(date +%H:%M:%S)  shortcut failed — is it named \"$SHORTCUT\"?"
  fi
  sleep "$EVERY"
done
