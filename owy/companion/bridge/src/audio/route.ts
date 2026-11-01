/** Where a turn's audio output lives: the device itself or the browser attached as its laptop audio. */
export type AudioRoute = "device" | "laptop";
/** Where a turn's microphone lives: the device, the attached browser, or an input of the Mac running the bridge (ffmpeg). */
export type MicRoute = AudioRoute | "host";

/** Maps the firmware's select options (`dispositivo` | `laptop`) and env values to a route. */
export function audioRoute(value: unknown, fallback: AudioRoute = "device"): AudioRoute {
  return value === "laptop" ? "laptop" : value === "dispositivo" || value === "device" ? "device" : fallback;
}

/** The mic select also offers `mac` (the bridge's own input). */
export function micRoute(value: unknown, fallback: MicRoute = "device"): MicRoute {
  if (value === "mac" || value === "host") return "host";
  if (value === "laptop" || value === "dispositivo" || value === "device") return audioRoute(value);
  return fallback;
}
