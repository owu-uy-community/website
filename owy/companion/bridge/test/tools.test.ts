import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { staffOnly } from "../../../agent/lib/staff";
import { createLogger } from "../src/log";
import {
  buildCompanionToolSet,
  evaluateApproval,
  executeToolByName,
  loadOwyToolDefinitions,
  makeToolContext,
  runOwyTool,
  trimForVoice,
  type OwyToolDefinition,
  type ToolRuntime,
} from "../src/realtime/tools";

const logger = createLogger("test", "error");

function runtime(overrides: Partial<ToolRuntime> = {}): ToolRuntime {
  return {
    deviceId: "owy-test",
    isStaff: () => false,
    isMarketplaceOpen: () => false,
    proposalCooldownMs: 60_000,
    logger,
    ...overrides,
  };
}

it("host-owned proposal cooldown survives rebuilding a web session's tools", async () => {
  const create = vi.fn(async () => ({ ok: true }));
  const defs = new Map<string, OwyToolDefinition>([
    ["create_track", { description: "Test only", inputSchema: z.object({}), execute: create }],
  ]);
  const history = new Map<string, number>();
  const options = runtime({ isMarketplaceOpen: () => true, proposalHistory: history });
  const input = { title: "Charla de prueba", speaker: "Ana", room: "Azul", timeSlot: "15:00" };
  const first = buildCompanionToolSet(defs, options);
  expect(await executeToolByName(first, "propose_talk", input, "one")).toMatchObject({ ok: true });
  const second = buildCompanionToolSet(defs, options);
  expect(await executeToolByName(second, "propose_talk", input, "two")).toMatchObject({ ok: false });
  expect(create).toHaveBeenCalledOnce();
});

describe("context shim", () => {
  it("maps staff mode to the authenticator agent/lib/staff.ts understands", () => {
    const attendee = makeToolContext({ staff: false, deviceId: "d1", toolName: "x", input: {} }) as {
      session: { auth: { current: { authenticator: string } } };
    };
    const staff = makeToolContext({ staff: true, deviceId: "d1", toolName: "x", input: {} }) as typeof attendee;
    expect(attendee.session.auth.current.authenticator).toBe("companion");
    expect(staff.session.auth.current.authenticator).toBe("companion-staff");
  });

  it("evaluates Owy's staffOnly() approval policy", async () => {
    const definition: OwyToolDefinition = {
      description: "x",
      inputSchema: z.object({}),
      approval: staffOnly(),
      execute: () => ({ ok: true }),
    };
    const denied = await evaluateApproval(
      definition,
      makeToolContext({ staff: false, deviceId: "d1", toolName: "x", input: {} })
    );
    expect(denied).toMatch(/staff/i);
    const allowed = await evaluateApproval(
      definition,
      makeToolContext({ staff: true, deviceId: "d1", toolName: "x", input: {} })
    );
    expect(allowed).toBeNull();
  });

  it("turns execution errors into a spoken-friendly result", async () => {
    const definition: OwyToolDefinition = {
      description: "x",
      inputSchema: z.object({}),
      execute: () => {
        throw new Error("Esta acción es solo para el staff");
      },
    };
    const result = await runOwyTool("x", definition, {}, runtime());
    expect(result).toEqual({ ok: false, error: "Esta acción es solo para el staff" });
  });
});

describe("voice trimming", () => {
  it("caps free slots and drops ids", () => {
    const trimmed = trimForVoice("find_free_slot", {
      openSpace: "OS",
      freeCells: [1, 2, 3, 4, 5].map((n) => ({
        room: `Sala ${n}`,
        timeSlot: "15:30 - 15:55",
        roomId: "r",
        scheduleId: "s",
      })),
    }) as { options: unknown[]; moreAvailable: number };
    expect(trimmed.options).toHaveLength(3);
    expect(trimmed.moreAvailable).toBe(2);
    expect(JSON.stringify(trimmed)).not.toContain("roomId");
  });

  it("groups the board by slot without ids", () => {
    const trimmed = trimForVoice("get_openspace_board", {
      openSpace: { id: "x", name: "Open Space" },
      rooms: [{ id: "r1", name: "Cueva", hasTV: true }],
      timeSlots: [{ id: "s1", name: "Bloque 1", slot: "15:30 - 15:55" }],
      cards: [{ id: "c1", title: "Lambdas", speaker: "Ana", room: "Cueva", timeSlot: "15:30 - 15:55" }],
      freeCells: [],
    }) as { cardsBySlot: { timeSlot: string; talks: string[] }[]; rooms: string[] };
    expect(trimmed.rooms).toEqual(["Cueva (tele)"]);
    expect(trimmed.cardsBySlot[0].talks[0]).toContain("Lambdas");
    expect(JSON.stringify(trimmed)).not.toContain("c1");
  });
});

describe("propose_talk", () => {
  const createTrack: OwyToolDefinition = {
    description: "create",
    inputSchema: z.object({ title: z.string(), room: z.string(), timeSlot: z.string() }),
    approval: staffOnly(),
    execute: vi.fn(async (input: unknown, ctx: unknown) => {
      const auth = (ctx as { session: { auth: { current: { authenticator: string } } } }).session.auth.current;
      if (auth.authenticator !== "companion-staff") throw new Error("solo staff");
      const { title, room, timeSlot } = input as { title: string; room: string; timeSlot: string };
      return { ok: true, card: { id: "c9", title, speaker: "Ana", room, timeSlot } };
    }),
  };
  const proposal = { title: "Lambdas", speaker: "Ana", room: "Cueva", timeSlot: "15:30" };

  it("refuses when the marketplace is closed for attendees", async () => {
    const tools = buildCompanionToolSet(new Map([["create_track", createTrack]]), runtime());
    const result = (await executeToolByName(tools, "propose_talk", proposal, "c1")) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cerrado/);
  });

  it("creates the card with a staff context when the marketplace is open, then enforces the cooldown", async () => {
    const onScreen = vi.fn();
    let now = 1_000_000;
    const tools = buildCompanionToolSet(
      new Map([["create_track", createTrack]]),
      runtime({ isMarketplaceOpen: () => true, onScreen, now: () => new Date(now) })
    );

    const first = (await executeToolByName(tools, "propose_talk", proposal, "c1")) as {
      ok: boolean;
      card: { title: string };
    };
    expect(first.ok).toBe(true);
    expect(first.card.title).toBe("Lambdas");
    expect(onScreen).toHaveBeenCalledWith(expect.objectContaining({ kind: "card" }));

    now += 10_000;
    const second = (await executeToolByName(tools, "propose_talk", proposal, "c2")) as { ok: boolean; error: string };
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/segundos/);

    now += 60_000;
    const third = (await executeToolByName(tools, "propose_talk", proposal, "c3")) as { ok: boolean };
    expect(third.ok).toBe(true);
  });

  it("lets staff propose regardless of the marketplace switch", async () => {
    const tools = buildCompanionToolSet(new Map([["create_track", createTrack]]), runtime({ isStaff: () => true }));
    const result = (await executeToolByName(tools, "propose_talk", proposal, "c1")) as { ok: boolean };
    expect(result.ok).toBe(true);
  });
});

describe("real agent tools", () => {
  it("load from agent/tools without eve, skipping the sandbox-only one", async () => {
    const definitions = await loadOwyToolDefinitions();
    expect(definitions.has("get_openspace_board")).toBe(true);
    expect(definitions.has("create_track")).toBe(true);
    expect(definitions.has("digitize_board_photo")).toBe(false);
    for (const [name, definition] of definitions) {
      expect(typeof definition.description, name).toBe("string");
    }
  });

  it("denies staff-only tools for attendees before touching the API", async () => {
    const definitions = await loadOwyToolDefinitions();
    const deleteTrack = definitions.get("delete_track");
    expect(deleteTrack).toBeDefined();
    const result = (await runOwyTool("delete_track", deleteTrack as OwyToolDefinition, { track: "x" }, runtime())) as {
      ok: boolean;
      denied?: boolean;
    };
    expect(result.ok).toBe(false);
    expect(result.denied).toBe(true);
  });
});
