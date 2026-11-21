/** A map of content/timeline/map.json (scripts/timeline/map.ts): its box in degrees and its shapes in pixels */
export type MapView = {
  /** [west, south, east, north] */
  box: [number, number, number, number];
  width: number;
  height: number;
  /** Departments, as SVG paths */
  shapes: { name: string; d: string }[];
};

export type MapDot = { slug: string; name: string; count: number; x: number; y: number };

/** [lat, lon] to the view's pixels, or null outside it (the projection map.ts drew the shapes with) */
export function project(view: MapView, [lat, lon]: [number, number]): [number, number] | null {
  const [west, south, east, north] = view.box;
  if (lon < west || lon > east || lat < south || lat > north) return null;
  const cos = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const scale = view.width / ((east - west) * cos);
  return [Math.round((lon - west) * cos * scale * 10) / 10, Math.round((north - lat) * scale * 10) / 10];
}

export const venueHref = (slug: string) => `/timeline/lugares/${slug}`;
