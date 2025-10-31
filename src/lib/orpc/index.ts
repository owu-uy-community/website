// Client-safe exports only
export { orpc, client } from "./client";
export type { AppRouter, StickyNote } from "./client";

// Note: Server-only exports (router, services) are in ./server.ts
