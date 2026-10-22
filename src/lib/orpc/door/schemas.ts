import * as z from "zod";

import { AttendeeSchema, ScanSchema } from "../attendees/schemas";

const token = z.string().min(10).max(500);

export const DoorTokenSchema = z.object({ token });
export const DoorSearchSchema = z.object({ token, q: z.string().trim().min(2).max(120) });
export const DoorScanSchema = ScanSchema.omit({ eventId: true }).extend({ token });
export const WalkInSchema = z.object({ token, name: z.string().trim().min(2).max(120) });

const Totals = z.object({ all: z.number(), in: z.number(), out: z.number() });

/** What a volunteer's door link opens: the event and how the door is going */
export const DoorInfoSchema = z.object({
  eventId: z.string(),
  name: z.string(),
  timezone: z.string(),
  communityName: z.string(),
  expiresAt: z.string(),
  totals: Totals,
});

/** People found at the door: names and tickets; never emails or ticket codes */
export const DoorSearchResultSchema = z.object({ rows: z.array(AttendeeSchema) });
export const DoorCountsSchema = z.object({ totals: Totals });

export const DoorLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });
