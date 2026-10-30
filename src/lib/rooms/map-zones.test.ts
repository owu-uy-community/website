import { describe, expect, test } from "vitest";

import { assignMapZones, MAP_ZONES } from "./map-zones";

const room = (id: string, name: string, sortOrder: number) => ({ id, name, sortOrder });

describe(assignMapZones, () => {
  test("rooms named like the floorplan's zones take them, case and accents aside", () => {
    const zones = assignMapZones([room("a", "lobby", 0), room("b", "Centro", 1), room("e", "rincon", 4)]);

    expect([zones.get("a"), zones.get("b"), zones.get("e")]).toStrictEqual(["LOBBY", "CENTRO", "RINCÓN"]);
  });

  test("a name match keeps its zone wherever it sits; other rooms fill the rest in board order", () => {
    const zones = assignMapZones([room("a", "Tercera", 2), room("b", "Cueva", 0), room("c", "Primera", 1)]);

    expect(zones.get("b")).toBe("CUEVA");
    expect([zones.get("c"), zones.get("a")]).toStrictEqual(["LOBBY", "CENTRO"]);
  });

  test("the floorplan has five zones: a sixth room is not drawn", () => {
    const zones = assignMapZones(Array.from({ length: 6 }, (_, index) => room(`r${index}`, `Sala ${index}`, index)));

    expect(zones.size).toBe(MAP_ZONES.length);
    expect(zones.get("r5")).toBeUndefined();
  });
});
