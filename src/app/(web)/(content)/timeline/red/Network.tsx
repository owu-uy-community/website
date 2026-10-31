"use client";

import Graph from "graphology";
import type { Attributes } from "graphology-types";
import { ArrowUpRight, Maximize2, Minimize2, Minus, Plus, Scan, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Sigma, { DEFAULT_STYLES } from "sigma";

import { cn } from "app/lib/utils";
import type { GraphKind, TimelineGraph } from "lib/timeline/graph";

import { Frame } from "./NetworkGate";

/** Categorical, one hue per kind; validated against the page's surface (#09090b) for color blindness */
const KINDS: Record<GraphKind, { color: string; one: string; many: string }> = {
  c: { color: "#c98500", one: "comunidad", many: "comunidades" },
  p: { color: "#3987e5", one: "persona", many: "personas" },
  v: { color: "#199e70", one: "lugar", many: "lugares" },
};
const DIM = "#27272a";

const number = new Intl.NumberFormat("es-UY");

/** Where a node's page is */
function href(key: string) {
  const slug = key.slice(2);
  if (key.startsWith("p:")) return `/timeline/personas/${slug}`;
  if (key.startsWith("v:")) return `/timeline/lugares/${slug}`;
  return `/timeline?comunidad=${slug}#archivo`;
}

/** The node in focus wears its name even where a bigger neighbor's would cover it */
type NodeState = { isFocused: boolean };

type NodeAttributes = { x: number; y: number; size: number; label: string; color: string; kind: GraphKind; n: number };

/** What the card says about the node in focus */
type Focus = { key: string; label: string; kind: GraphKind; events: number; links: Record<GraphKind, number> };

/**
 * The history as a network, drawn by sigma (WebGL) with the layout the server computed. Hovering
 * (or tapping) a node lights it and its connections; its card opens its page.
 */
export default function Network() {
  const [data, setData] = useState<TimelineGraph | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<Sigma<NodeAttributes, Attributes, Attributes, NodeState> | null>(null);
  const select = useRef<(key: string | null) => void>(() => {});
  const [focus, setFocus] = useState<Focus | null>(null);
  const [shown, setShown] = useState<Record<GraphKind, boolean>>({ c: true, p: true, v: true });
  const [query, setQuery] = useState("");
  // The whole network on the screen: the browser's full screen where there is one, else (iPhone) the
  // page's own, over everything
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<false | "native" | "page">(false);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current ? "native" : false);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Sigma only follows the window's size: it redraws for the new box. With nothing to scroll past,
  // the wheel zooms without Ctrl
  useEffect(() => {
    const sigma = renderer.current;
    if (!sigma) return;
    sigma.setSetting("gestureTarget", full ? "graph" : "shared");
    sigma.resize(true);
  }, [full]);

  // The page's own full screen: in the top layer, over the navbar (the layout's z-20 would trap a
  // z-index), Esc leaves it, and the page under it stays put
  useEffect(() => {
    if (full !== "page") return;
    box.current?.showPopover?.();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [full]);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (full) setFull(false);
    else if (document.fullscreenEnabled && box.current) void box.current.requestFullscreen();
    else setFull("page");
  };

  useEffect(() => {
    void fetch("/timeline/red/datos.json")
      .then((response) => response.json())
      .then(setData);
  }, []);

  // Each name once in the search box's suggestions, with its kind when two share it
  const options = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of data?.nodes ?? []) map.set(`${node.l} · ${KINDS[node.t].one}`, node.k);
    return map;
  }, [data]);

  useEffect(() => {
    if (!data || !container.current) return;
    const graph = new Graph<NodeAttributes>({ type: "undirected" });
    for (const node of data.nodes)
      graph.addNode(node.k, {
        x: node.x,
        y: node.y,
        size: node.s,
        label: node.l,
        color: KINDS[node.t].color,
        kind: node.t,
        n: node.n,
      });
    for (const [a, b, weight] of data.edges)
      graph.addEdge(data.nodes[a].k, data.nodes[b].k, { size: Math.min(3, 0.4 + Math.log2(weight) * 0.5) });

    const sigma = new Sigma<NodeAttributes, Attributes, Attributes, NodeState>(graph, container.current, {
      customNodeState: { isFocused: false },
      settings: {
        // The page scrolls past it: zooming takes Ctrl (⌘) and the wheel, or two fingers
        gestureTarget: "shared",
        sharedGestureWheelMessage: "Usá Ctrl + la rueda para acercarte",
        sharedGestureAppleWheelMessage: "Usá ⌘ + la rueda para acercarte",
        sharedGestureTouchMessage: "Usá dos dedos para moverte por la red",
        // Sizes in pixels (v4 defaults to layout units, which shrink with a wider layout)
        itemSizesReference: "screen",
        labelRenderedSizeThreshold: 6,
        labelDensity: 0.3,
        minCameraRatio: 0.04,
        maxCameraRatio: 1.5,
        stagePadding: 24,
      },
      styles: {
        nodes: [
          DEFAULT_STYLES.nodes,
          {
            // With one in focus, the rest fade back and keep quiet
            color: (attributes, state, graphState) =>
              graphState.hasHighlighted && !state.isHighlighted ? DIM : attributes.color,
            labelColor: "#e4e4e7",
            labelFont: getComputedStyle(document.body).fontFamily,
            labelVisibility: (_, state, graphState) =>
              state.isHovered || state.isFocused
                ? "visible"
                : graphState.hasHighlighted && !state.isHighlighted
                  ? "hidden"
                  : "auto",
            depth: (_, state) => (state.isHovered || state.isHighlighted ? "topNodes" : "nodes"),
            zIndex: (_, state) => (state.isHovered || state.isFocused ? 1 : 0),
            labelDepth: (_, state) => (state.isHovered || state.isFocused ? "topNodes" : "nodes"),
            backdropVisibility: (_, state) => (state.isHovered || state.isFocused ? "visible" : "hidden"),
            backdropColor: "#18181b",
            backdropShadowColor: "rgba(0, 0, 0, 0.6)",
          },
        ],
        edges: [
          DEFAULT_STYLES.edges,
          {
            color: (_, state, graphState) =>
              !graphState.hasHighlighted
                ? "rgba(255, 255, 255, 0.07)"
                : state.isHighlighted
                  ? "rgba(250, 204, 21, 0.55)"
                  : "rgba(255, 255, 255, 0.015)",
          },
        ],
      },
    });
    renderer.current = sigma;

    // The one in focus: the node hovered, else the one picked (a tap, the search)
    let lit: string | null = null;
    let picked: string | null = null;
    const light = (key: string | null) => {
      if (lit === key) return;
      if (lit) {
        sigma.setNodesState([lit, ...graph.neighbors(lit)], { isHighlighted: false });
        sigma.setNodeState(lit, { isFocused: false });
        sigma.setEdgesState(graph.edges(lit), { isHighlighted: false });
      }
      lit = key;
      if (!key) return setFocus(null);
      sigma.setNodesState([key, ...graph.neighbors(key)], { isHighlighted: true });
      sigma.setNodeState(key, { isFocused: true });
      sigma.setEdgesState(graph.edges(key), { isHighlighted: true });
      const links = { c: 0, p: 0, v: 0 };
      for (const other of graph.neighbors(key)) links[graph.getNodeAttribute(other, "kind")]++;
      const { label, kind, n } = graph.getNodeAttributes(key);
      setFocus({ key, label, kind, events: n, links });
    };
    select.current = (key) => {
      picked = key;
      light(key);
    };
    sigma.on("enterNode", ({ node }) => light(node));
    sigma.on("leaveNode", () => light(picked));
    sigma.on("clickNode", ({ node }) => select.current(node));
    sigma.on("clickStage", () => select.current(null));

    return () => {
      sigma.kill();
      renderer.current = null;
    };
  }, [data]);

  // The legend hides and shows a kind
  useEffect(() => {
    const sigma = renderer.current;
    if (!sigma || !data) return;
    for (const kind of ["c", "p", "v"] as const)
      sigma.setNodesState(
        data.nodes.filter((node) => node.t === kind).map((node) => node.k),
        { isHidden: !shown[kind] }
      );
  }, [shown, data]);

  const find = (value: string) => {
    setQuery(value);
    const key = options.get(value);
    const sigma = renderer.current;
    if (!key || !sigma) return;
    select.current(key);
    const at = sigma.getNodeDisplayData(key);
    if (at) void sigma.getCamera().animate({ x: at.x, y: at.y, ratio: 0.3 }, { duration: 600 });
  };

  if (!data) return <Frame />;
  const counts = Object.groupBy(data.nodes, (node) => node.t);
  const camera = () => renderer.current?.getCamera();

  return (
    <div
      ref={box}
      className={cn(
        "flex flex-col gap-3",
        full && "h-dvh bg-zinc-950 p-3 sm:p-4",
        // A popover's own look (centered, bordered, fit to content) undone
        full === "page" && "fixed inset-0 z-[70] m-0 w-full max-w-none border-0 text-inherit"
      )}
      popover={full === "page" ? "manual" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar una comunidad, una persona o un lugar</span>
          <input
            className="h-10 w-full rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-yellow-400/60 focus:outline-none"
            list="red-nombres"
            onChange={(event) => find(event.target.value)}
            placeholder="Buscá una comunidad, una persona o un lugar"
            type="search"
            value={query}
          />
          <datalist id="red-nombres">
            {[...options.keys()].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <ul aria-label="Qué mostrar" className="flex flex-wrap gap-2">
          {(["c", "p", "v"] as const).map((kind) => (
            <li key={kind}>
              <button
                aria-pressed={shown[kind]}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors",
                  shown[kind]
                    ? "border-white/15 bg-white/[0.04] text-zinc-100"
                    : "border-white/[0.06] text-zinc-500 line-through"
                )}
                onClick={() => setShown((current) => ({ ...current, [kind]: !current[kind] }))}
                type="button"
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: KINDS[kind].color }} />
                {number.format(counts[kind]?.length ?? 0)} {KINDS[kind].many}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950",
          full && "min-h-0 flex-1"
        )}
      >
        <div
          ref={container}
          aria-label="La red de comunidades, personas y lugares: usá el buscador para ir a uno"
          className={cn("w-full", full ? "h-full" : "h-[72vh] min-h-[28rem]")}
          role="application"
        />

        {focus ? (
          <div className="absolute top-3 left-3 w-[min(20rem,calc(100%-1.5rem))] rounded-xl border border-white/10 bg-zinc-900/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] text-zinc-400">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: KINDS[focus.kind].color }} />
                  {KINDS[focus.kind].one}
                </p>
                <p className="mt-1 font-medium text-zinc-100">{focus.label}</p>
              </div>
              <button
                aria-label="Cerrar"
                className="-m-1 rounded-full p-1 text-zinc-400 hover:text-white"
                onClick={() => select.current(null)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
              {number.format(focus.events)} {focus.events === 1 ? "evento" : "eventos"} ·{" "}
              {(["c", "p", "v"] as const)
                .filter((kind) => focus.links[kind])
                .map(
                  (kind) =>
                    `${number.format(focus.links[kind])} ${focus.links[kind] === 1 ? KINDS[kind].one : KINDS[kind].many}`
                )
                .join(", ")}
            </p>
            <Link
              className="mt-3 inline-flex items-center gap-1 text-[13px] text-zinc-200 underline decoration-white/25 underline-offset-4 hover:decoration-yellow-400"
              href={href(focus.key)}
            >
              {focus.kind === "c" ? "Ver sus eventos" : "Ver su página"}{" "}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </div>
        ) : null}

        <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/90">
          <button
            aria-label="Acercar"
            className="p-2.5 text-zinc-300 hover:bg-white/[0.06] hover:text-white"
            onClick={() => void camera()?.zoomIn()}
            type="button"
          >
            <Plus className="size-4" />
          </button>
          <button
            aria-label="Alejar"
            className="p-2.5 text-zinc-300 hover:bg-white/[0.06] hover:text-white"
            onClick={() => void camera()?.zoomOut()}
            type="button"
          >
            <Minus className="size-4" />
          </button>
          <button
            aria-label="Ver toda la red"
            className="p-2.5 text-zinc-300 hover:bg-white/[0.06] hover:text-white"
            onClick={() => void camera()?.reset()}
            title="Ver toda la red"
            type="button"
          >
            <Scan className="size-4" />
          </button>
          <button
            aria-label={full ? "Salir de pantalla completa" : "Pantalla completa"}
            aria-pressed={Boolean(full)}
            className="border-t border-white/10 p-2.5 text-zinc-300 hover:bg-white/[0.06] hover:text-white"
            onClick={toggleFull}
            title={full ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
            type="button"
          >
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>
      <p className={cn("text-xs text-zinc-500", full && "hidden")}>
        Pasá por encima de un punto (o tocalo) para ver con quién se conecta; el tamaño es cuántos eventos tiene. Ctrl
        (⌘) y la rueda, o dos dedos, para acercarte.
      </p>
    </div>
  );
}
