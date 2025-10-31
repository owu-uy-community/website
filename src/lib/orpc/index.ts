// Client-safe exports only
export { orpc, client } from "./client";
export type { AppRouter, StickyNote } from "./client";

// Export types from schemas (safe for client)
export type { Room } from "./rooms/schemas";
export type { Schedule } from "./schedules/schemas";
export type { TrackWithRelations } from "./sticky-notes/services/get-by-open-space";

// Note: Server-only exports (router, services) are in ./server.ts
