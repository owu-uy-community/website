/** Where a turn's microphone / audio output live: the device itself or the machine running the bridge. */
export type AudioRoute = "device" | "laptop";

/** Maps the firmware's select options (`dispositivo` | `laptop`) and env values to a route. */
export function audioRoute(value: unknown, fallback: AudioRoute = "device"): AudioRoute {
  return value === "laptop" ? "laptop" : value === "dispositivo" || value === "device" ? "device" : fallback;
}
