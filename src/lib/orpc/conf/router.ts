import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { CONF_DATES } from "app/lib/constants";

import { pub } from "../base";

/*
 * Lives only on the server: until the release this procedure is the one way to
 * the link, and it answers by the server's clock — a visitor who moves their
 * own clock forward gets a countdown that ends early and still no link.
 */
const TICKETS_URL = "https://www.eventbrite.com.ar/e/owu-conf-2026-tickets-1998511280037";
const RELEASE_MS = Date.parse(CONF_DATES.ticketsRelease);

export const TicketsSchema = z.object({
  /** The server's clock (epoch ms) as it answered; the page counts down on it, not on the visitor's */
  now: z.number(),
  releaseAt: z.iso.datetime({ offset: true }),
  /** Null until the release */
  url: z.url().nullable(),
});

export const ticketsAt = (now: number): z.infer<typeof TicketsSchema> => ({
  now,
  releaseAt: CONF_DATES.ticketsRelease,
  url: now >= RELEASE_MS ? TICKETS_URL : null,
});

export const confRouter = {
  getTickets: pub
    .meta(openapi({ tags: ["Conf"], summary: "OWU CONF tickets: the release time, and the link once it's out" }))
    .output(TicketsSchema)
    .handler(() => ticketsAt(Date.now())),
};
