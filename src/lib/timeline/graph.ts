import "server-only";

import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { cache } from "react";

import { getTimeline } from "./data";
import { getVenues } from "./venues";

/*
 * The history as a network (/timeline/red): communities, the people who organized or spoke at
 * them, and the places where they met. Laid out here, once per deploy, so the page only draws it.
 */

/** c: a community, p: a person, v: a venue */
export type GraphKind = "c" | "p" | "v";

/** A node: its key ("c:jsconfuy"), name, kind, place on the layout, size and events */
export type GraphNode = { k: string; l: string; t: GraphKind; x: number; y: number; s: number; n: number };

/** An edge between two nodes (their index in `nodes`), and how many events it stands for */
export type GraphEdge = [number, number, number];

export type TimelineGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** 0..1 from a string: the same start for the same node on every build, so the layout stays put */
const hash = (text: string, seed: number) => {
  let h = 2_166_136_261 ^ seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16_777_619);
  return (h >>> 0) / 4_294_967_296;
};

const round = (value: number) => Math.round(value * 10) / 10;

export const getGraph = cache((): TimelineGraph => {
  const { events, community, person } = getTimeline();
  const { venues } = getVenues();

  // How many events tie each pair: a person to a community (organized, or gave a talk), a venue to one
  const ties = new Map<string, number>();
  const tie = (a: string, b: string) => ties.set(`${a}|${b}`, (ties.get(`${a}|${b}`) ?? 0) + 1);
  const count = new Map<string, number>();
  const add = (key: string) => count.set(key, (count.get(key) ?? 0) + 1);

  for (const event of events) {
    if (event.kind === "hito" || !community.has(event.community)) continue;
    const group = `c:${event.community}`;
    add(group);
    // Someone who organized it and spoke at it counts once
    const people = new Set([
      ...(event.organizers ?? []).map(({ person: slug }) => slug),
      ...(event.talks ?? []).flatMap((talk) => (talk.speakers ?? []).flatMap(({ person: slug }) => slug ?? [])),
    ]);
    for (const slug of people) {
      if (!person.has(slug)) continue;
      add(`p:${slug}`);
      tie(`p:${slug}`, group);
    }
  }
  for (const venue of venues)
    for (const event of venue.events) {
      if (!community.has(event.community)) continue;
      add(`v:${venue.slug}`);
      tie(`v:${venue.slug}`, `c:${event.community}`);
    }

  const graph = new Graph({ type: "undirected" });
  const label = (key: string) => {
    const slug = key.slice(2);
    if (key.startsWith("c:")) return community.get(slug)!.name;
    if (key.startsWith("p:")) return person.get(slug)!.name;
    return venues.find((venue) => venue.slug === slug)!.name;
  };
  for (const [key, n] of count) {
    const angle = hash(key, 1) * 2 * Math.PI;
    const radius = 100 * Math.sqrt(hash(key, 2));
    graph.addNode(key, { x: radius * Math.cos(angle), y: radius * Math.sin(angle), n });
  }
  for (const [pair, weight] of ties) {
    const [a, b] = pair.split("|");
    graph.addEdge(a, b, { weight });
  }

  // A community nobody is tied to says nothing here, and drifts off on its own
  for (const key of graph.filterNodes((node) => graph.degree(node) === 0)) graph.dropNode(key);

  // ForceAtlas2, the Gephi layout: linked nodes pull together, every node pushes the rest away.
  // Measured on this graph: LinLog mode never settles (edges as long as random pairs), and without
  // strong gravity the small pieces float 2.6 times past the rest, shrinking the network to a dot
  forceAtlas2.assign(graph, {
    iterations: 600,
    getEdgeWeight: "weight",
    settings: {
      ...forceAtlas2.inferSettings(graph),
      barnesHutOptimize: true,
      strongGravityMode: true,
      gravity: 0.05,
      scalingRatio: 10,
    },
  });

  const keys = graph.nodes();
  const index = new Map(keys.map((key, i) => [key, i]));
  return {
    nodes: keys.map((key) => {
      const { x, y, n } = graph.getNodeAttributes(key) as { x: number; y: number; n: number };
      const kind = key[0] as GraphKind;
      // A disc's area grows with its events; communities weigh most, people least
      const [base, grow] = kind === "c" ? [2, 0.8] : kind === "v" ? [1.5, 0.6] : [1, 0.5];
      return { k: key, l: label(key), t: kind, x: round(x), y: round(y), s: round(base + grow * Math.sqrt(n)), n };
    }),
    edges: graph.mapEdges((_, { weight }, source, target): GraphEdge => [
      index.get(source)!,
      index.get(target)!,
      weight as number,
    ]),
  };
});
