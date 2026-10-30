/** What one GetStreamStatus poll returns that says how the stream is doing. */
export type StreamStatus = {
  outputActive: boolean;
  outputBytes: number;
  outputCongestion: number;
  outputReconnecting: boolean;
};

export type BytesSample = { bytes: number; at: number };

/**
 * The stream's bitrate from the bytes OBS sent since the previous poll (bits per ms = kbit/s),
 * or `null` until there are two samples of the same stream (a restart resets the byte count).
 */
export function streamKbps(stream: StreamStatus, previous: BytesSample | null, at: number): number | null {
  if (!stream.outputActive || !previous || at <= previous.at || stream.outputBytes < previous.bytes) return null;

  return ((stream.outputBytes - previous.bytes) * 8) / (at - previous.at);
}

/** OBS's own reading of congestion (0–1): above 0.8 the stream is in trouble, above 0.5 it's straining. */
export function congestionTone(congestion: number): "ok" | "warn" | "live" {
  if (congestion > 0.8) return "live";
  if (congestion > 0.5) return "warn";

  return "ok";
}
