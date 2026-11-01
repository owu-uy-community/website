#!/bin/sh
# The bridge at the venue: native on the Mac (its mic and its speaker need macOS), kept
# awake, and started again whenever it exits — a setting from the panel that needs a
# restart, «Reiniciar», a crash. Ctrl-C (a clean stop, exit 0) ends it for good.
# Run it from Terminal: macOS gives the Microphone permission to the terminal app.
#
#   pnpm -C owy companion:serve
cd "$(dirname "$0")/../.." || exit 1
while true; do
  caffeinate -dims ./node_modules/.bin/tsx companion/bridge/src/main.ts
  code=$?
  [ "$code" -eq 0 ] && exit 0
  echo "el bridge salió ($code); arranco de nuevo en 2 s" >&2
  sleep 2
done
