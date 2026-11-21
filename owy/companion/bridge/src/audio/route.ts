/**
 * Where a turn's audio lives: the device itself, the browser attached as its
 * laptop audio, or `host` — the Mac running the bridge (its input via ffmpeg
 * avfoundation, its output via audiotoolbox).
 */
export type AudioRoute = "device" | "laptop" | "host";
export type MicRoute = AudioRoute;

/** Maps the firmware's select options (`dispositivo` | `laptop` | `mac`) and env values to a route. */
export function audioRoute(value: unknown, fallback: AudioRoute = "device"): AudioRoute {
  if (value === "laptop") return "laptop";
  if (value === "mac" || value === "host") return "host";
  if (value === "dispositivo" || value === "device") return "device";
  return fallback;
}

/** The mic select's options are the same three. */
export const micRoute = audioRoute;
