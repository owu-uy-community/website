/**
 * Realtime broadcast client. Historically this exported a Supabase client;
 * realtime now runs on the native WebSocket transport (/api/realtime + dev
 * sidecar) and this module keeps the same `supabase.channel(...)` surface so
 * existing hooks work unchanged. New code should use useRealtimeChannel or
 * lib/realtime/client directly.
 */
export { realtimeCompat as supabase } from "../../lib/realtime/compat";
export type { CompatChannel as RealtimeChannel } from "../../lib/realtime/compat";
