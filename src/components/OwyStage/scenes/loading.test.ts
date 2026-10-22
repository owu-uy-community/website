import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Scene code is loaded per scene (see index.tsx): a page that imports a scene
 * file directly drags all of it into its bundle again — the desk did through
 * the wall's StageClient, the phones through two emoji lists.
 */
const SRC = resolve(import.meta.dirname, "../../..");
const SCENES = import.meta.dirname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);

    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** What a file imports for its values (type-only imports cost nothing at runtime), as paths. */
function valueImports(file: string) {
  const source = readFileSync(file, "utf8");

  return [...source.matchAll(/^(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s+"([^"]+)"/gm)].map(([, spec]) =>
    spec.startsWith(".") ? resolve(dirname(file), spec) : resolve(SRC, spec)
  );
}

const intoScenes = (path: string) => path.startsWith(`${SCENES}/`);

describe("scene code splitting", () => {
  test("the loader map imports no scene up front", () => {
    expect(valueImports(join(SCENES, "index.tsx")).filter(intoScenes)).toStrictEqual([]);
  });

  test("outside the scenes folder, nothing imports a scene file directly", () => {
    const offenders = sources(SRC)
      .filter((file) => !intoScenes(file))
      .flatMap((file) =>
        valueImports(file)
          .filter(intoScenes)
          .map((path) => `${relative(SRC, file)} → ${relative(SRC, path)}`)
      );

    expect(offenders).toStrictEqual([]);
  });

  test("the desk never loads the wall's engine", () => {
    const engine = ["components/OwyStage/StageClient", "components/OwyStage/Stage", "components/OwyStage/scenes"].map(
      (path) => resolve(SRC, path)
    );
    const desk = [...sources(join(SRC, "components/Admin")), ...sources(join(SRC, "app/admin"))];
    const offenders = desk.flatMap((file) =>
      valueImports(file)
        .filter((path) => engine.includes(path))
        .map((path) => `${relative(SRC, file)} → ${relative(SRC, path)}`)
    );

    expect(offenders).toStrictEqual([]);
  });
});
