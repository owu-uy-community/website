import "server-only";

import { and, asc, desc, eq, lte } from "drizzle-orm";

export type OpenSpaceSession = { id: string; title: string; speaker: string | null };
export type OpenSpaceEdition = { id: string; name: string; startDate: string; sessions: OpenSpaceSession[] };

/**
 * Session titles people proposed at every open space that already started,
 * newest event first. Never throws: without a database the page just skips them.
 */
export async function getOpenSpaceSessions(): Promise<OpenSpaceEdition[]> {
  try {
    // Imported lazily: lib/db throws at import time when DATABASE_URL is unset
    const { db } = await import("lib/db");
    const { events, tracks } = await import("lib/db/schema");

    const rows = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        speaker: tracks.speaker,
        eventId: events.id,
        eventName: events.name,
        startDate: events.startDate,
      })
      .from(tracks)
      .innerJoin(events, eq(tracks.openSpaceId, events.id))
      .where(and(eq(events.isActive, true), lte(events.startDate, new Date())))
      .orderBy(desc(events.startDate), asc(tracks.title));

    const editions = new Map<string, OpenSpaceEdition>();
    for (const row of rows) {
      const title = row.title.trim();
      if (!title) continue;
      const edition = editions.get(row.eventId) ?? {
        id: row.eventId,
        name: row.eventName,
        startDate: row.startDate.toISOString(),
        sessions: [],
      };
      edition.sessions.push({ id: row.id, title, speaker: row.speaker?.trim() || null });
      editions.set(row.eventId, edition);
    }

    return [...editions.values()];
  } catch {
    return [];
  }
}
