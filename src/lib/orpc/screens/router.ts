import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { pub, staff } from "../base";
import { limiter } from "../ratelimit";
import {
  BeatSchema,
  ListScreensSchema,
  RenameScreenSchema,
  ScreenRefSchema,
  ScreenSchema,
  type BeatInput,
} from "./schemas";
import * as Screens from "./service";

const docs = (summary: string) => openapi({ tags: ["Screens"], summary });
const ok = z.object({ ok: z.literal(true) });

/**
 * A display beats every 20 s and when it comes back to the foreground (~3 a minute); this only
 * stops a reload loop or a script from hammering the table. ponytail: keyed on the display's own
 * id, like the phones at /owy/play — per IP would lump a whole venue behind one NAT.
 */
const beatLimit = ratelimit({
  limiter: limiter({ prefix: "screen-beat:", maxRequests: 10, window: 60_000 }),
  key: (_options, input: BeatInput) => input.id,
});

// Displays have no session: they only beat. Everything else is the site staff's.
export const screensRouter = {
  beat: pub
    .meta(docs("A display is alive and showing this path"))
    .input(BeatSchema)
    .use(beatLimit)
    .output(ok)
    .effect(function* ({ input }) {
      return yield* Screens.beat(input);
    }),

  list: staff
    .meta(docs("An event's screens, with when each was last seen"))
    .input(ListScreensSchema)
    .output(z.array(ScreenSchema))
    .effect(function* ({ input }) {
      return yield* Screens.listScreens(input.eventId);
    }),

  rename: staff
    .meta(docs("Name a screen"))
    .input(RenameScreenSchema)
    .output(ScreenSchema)
    .effect(function* ({ input }) {
      return yield* Screens.renameScreen(input);
    }),

  forget: staff
    .meta(docs("Drop a screen from the list"))
    .input(ScreenRefSchema)
    .output(ok)
    .effect(function* ({ input }) {
      return yield* Screens.forgetScreen(input.id);
    }),

  identify: staff
    .meta(docs("Show a screen's name on it, full screen, for a few seconds"))
    .input(ScreenRefSchema)
    .output(ok)
    .effect(function* ({ input }) {
      return yield* Screens.signalScreen(input.id, "identify");
    }),

  reload: staff
    .meta(docs("Reload a screen"))
    .input(ScreenRefSchema)
    .output(ok)
    .effect(function* ({ input }) {
      return yield* Screens.signalScreen(input.id, "reload");
    }),
};
