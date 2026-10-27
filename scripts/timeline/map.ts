/* eslint-disable no-console */
/**
 * The maps of /timeline/lugares (content/timeline/map.json): Uruguay by department, and the stretch
 * of Montevideo where nearly every venue is, as SVG paths in each view's own coordinates.
 *
 * Usage:
 *   pnpm tsx scripts/timeline/map.ts <geoBoundaries-URY-ADM1.geojson>
 *
 * The input is geoBoundaries' ADM1 for Uruguay (OpenStreetMap data, ODbL), full resolution:
 * https://www.geoboundaries.org/api/current/gbOpen/URY/ADM1/ → gjDownloadURL
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { MapView } from "../../src/lib/timeline/map";

type Ring = [number, number][];
type Feature = {
  properties: { shapeName: string };
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
};

const input = process.argv[2];
if (!input) {
  console.error("Usage: pnpm tsx scripts/timeline/map.ts <geoBoundaries-URY-ADM1.geojson>");
  process.exit(1);
}
const { features } = JSON.parse(readFileSync(input, "utf8")) as { features: Feature[] };

/** Sutherland–Hodgman against the view's box: what's left of a ring inside it */
function clip(ring: Ring, [west, south, east, north]: number[]): Ring {
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [([x]) => x >= west, (a, b) => [west, a[1] + ((b[1] - a[1]) * (west - a[0])) / (b[0] - a[0])]],
    [([x]) => x <= east, (a, b) => [east, a[1] + ((b[1] - a[1]) * (east - a[0])) / (b[0] - a[0])]],
    [([, y]) => y >= south, (a, b) => [a[0] + ((b[0] - a[0]) * (south - a[1])) / (b[1] - a[1]), south]],
    [([, y]) => y <= north, (a, b) => [a[0] + ((b[0] - a[0]) * (north - a[1])) / (b[1] - a[1]), north]],
  ];
  let points = ring;
  for (const [inside, cross] of edges) {
    const kept: Ring = [];
    for (let i = 0; i < points.length; i++) {
      const [point, previous] = [points[i], points[(i + points.length - 1) % points.length]];
      if (inside(point)) {
        if (!inside(previous)) kept.push(cross(previous, point));
        kept.push(point);
      } else if (inside(previous)) kept.push(cross(previous, point));
    }
    points = kept;
    if (!points.length) break;
  }
  return points;
}

/** Douglas–Peucker: drops the points closer than `tolerance` (in pixels) to the line they're on */
function simplify(points: Ring, tolerance: number): Ring {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)!];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let far = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const distance = Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / length;
    if (distance > far) [far, index] = [distance, i];
  }
  return far > tolerance
    ? [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)]
    : [a, b];
}

function view(box: [number, number, number, number], width: number, tolerance: number): MapView {
  const [west, south, east, north] = box;
  // Equirectangular, squeezed by the latitude's cosine so distances look right this close to it
  const cos = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const scale = width / ((east - west) * cos);
  const project = ([lon, lat]: [number, number]): [number, number] => [
    (lon - west) * cos * scale,
    (north - lat) * scale,
  ];
  // Cut a little outside the view, so the cut edges (and their outline) fall outside it
  const margin = (east - west) * 0.01;
  const outer = [west - margin, south - margin, east + margin, north + margin];
  const shapes = features.flatMap((feature) => {
    const polygons =
      feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const d = polygons
      .map((rings) => clip(rings[0], outer))
      .filter((ring) => ring.length > 2)
      .map((ring) => {
        // Open (a ring ends where it starts, and a line from a point to itself has no sides)
        const open = ring.at(-1)![0] === ring[0][0] && ring.at(-1)![1] === ring[0][1] ? ring.slice(0, -1) : ring;
        const points = simplify(open.map(project), tolerance);
        return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
      })
      .join("");
    return d ? [{ name: feature.properties.shapeName, d }] : [];
  });
  return { box, width, height: Math.round((north - south) * scale), shapes };
}

const map = {
  uruguay: view([-58.5, -35.05, -53.05, -30.05], 600, 1.2),
  // Where 98% of the pinned venues are: from the Cerro to Carrasco, the coast to Tres Cruces
  montevideo: view([-56.235, -34.945, -56.035, -34.845], 800, 0.5),
};
const out = path.resolve("content/timeline/map.json");
writeFileSync(out, `${JSON.stringify(map)}\n`);
console.log(
  `✓ ${Object.entries(map)
    .map(([name, { shapes }]) => `${name}: ${shapes.length} shapes`)
    .join(" · ")} → ${path.relative(process.cwd(), out)} (${Math.round(readFileSync(out).length / 1024)} KB)`
);
