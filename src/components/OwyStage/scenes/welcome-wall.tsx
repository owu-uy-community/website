"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import type { StageArrival } from "lib/orpc/owy-stage/schemas";
import type { SceneProps } from "lib/owy-stage/scenes";
import { wallLayout, type Tile } from "lib/owy-stage/welcome-wall";
import { eventChannel } from "lib/realtime/channels";

import { BRAND, StageContext } from "../Stage";
import { Rise } from "./parts";

// ---------------------------------------------------------------------------
// Welcome wall — a hello for each person checked in at the door, then their avatar joins the wall
// ---------------------------------------------------------------------------

/** How long a hello holds before the avatar flies to its tile; shorter while people queue at the door. */
const HELLO_MS = 4_200;
const LAND_MS = 900;
const helloFor = (waiting: number) => Math.max(1_600, HELLO_MS - waiting * 600);

/** The avatar's place while it says hello. */
const HOME: Tile = { left: 230, top: 310, size: 440 };

const TILE_COLORS = [BRAND.blue, BRAND.yellow, BRAND.cream] as const;
const colorOf = (id: string) => TILE_COLORS[id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * Who has arrived: read once, then again when the door says someone came in (the event's ops
 * ping, spread so every screen doesn't ask at once), when the socket (re)opens, and every 30 s.
 */
function useArrivals(eventId: string | null, preview: boolean) {
  const [list, setList] = useState<StageArrival[] | null>(null);
  const load = useCallback(() => {
    client.owyStage
      .getArrivals()
      .then(setList)
      .catch((error) => console.error("[stage] arrivals", error));
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    load();
    if (preview) return;
    const id = setInterval(load, 30_000);
    return () => {
      clearInterval(id);
      clearTimeout(timer.current);
    };
  }, [load, preview]);
  const { isConnected } = useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "ops") : null, (event) => {
    if (event !== "checkins") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 200 + Math.random() * 800);
  });
  useEffect(() => {
    if (isConnected && !preview) load();
  }, [isConnected, load, preview]);

  return list;
}

/** The hellos still to say, one at a time. The first read fills the wall; only later arrivals get one. */
function useHellos(list: StageArrival[] | null) {
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<StageArrival[]>([]);
  const [hello, setHello] = useState<{ person: StageArrival; landing: boolean } | null>(null);
  const waiting = useRef(0);
  waiting.current = queue.length;

  useEffect(() => {
    if (!list) return;
    const ids = new Set(list.map((person) => person.id));
    if (!seen.current) {
      seen.current = ids;
      return;
    }
    const known = seen.current;
    const fresh = list.filter((person) => !known.has(person.id));
    for (const person of fresh) known.add(person.id);
    // A check-in undone at the door leaves the queue too
    setQueue((current) => [...current.filter((person) => ids.has(person.id)), ...fresh]);
  }, [list]);

  useEffect(() => {
    if (hello || !queue.length) return;
    setHello({ person: queue[0], landing: false });
    setQueue((current) => current.slice(1));
  }, [hello, queue]);

  useEffect(() => {
    if (!hello) return;
    const id = setTimeout(
      () => setHello(hello.landing ? null : { ...hello, landing: true }),
      hello.landing ? LAND_MS : helloFor(waiting.current)
    );
    return () => clearTimeout(id);
  }, [hello]);

  const pending = useMemo(
    () => new Set([...queue.map((person) => person.id), ...(hello ? [hello.person.id] : [])]),
    [queue, hello]
  );

  return { hello, pending };
}

/**
 * Initials on a brand colour, and the picture fading in over them once it arrives (a 404 keeps the
 * initials). `loaded` remembers each answer, so the tile a hello lands on doesn't load it again.
 */
function Avatar({ person, loaded }: { person: StageArrival; loaded: Map<string, boolean> }) {
  const [shown, setShown] = useState(loaded.get(person.id));
  const color = colorOf(person.id);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-full" style={{ background: color }}>
      {/* SVG text scales with the circle, also while a hello shrinks into its tile */}
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        <text
          dominantBaseline="central"
          fill={color === BRAND.blue ? BRAND.cream : BRAND.black}
          fontSize="38"
          fontWeight="800"
          textAnchor="middle"
          x="50"
          y="52"
        >
          {initials(person.name)}
        </text>
      </svg>
      {shown !== false && (
        <img
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
          src={`/api/owy-stage/avatar/${encodeURIComponent(person.id)}`}
          onError={() => {
            loaded.set(person.id, false);
            setShown(false);
          }}
          onLoad={() => {
            loaded.set(person.id, true);
            setShown(true);
          }}
        />
      )}
    </div>
  );
}

function Hello({
  person,
  landing,
  tile,
  subtitle,
  loaded,
}: {
  person: StageArrival;
  landing: boolean;
  tile: Tile | null;
  subtitle: string;
  loaded: Map<string, boolean>;
}) {
  const first = person.name.split(/\s+/)[0];
  // The name fills the line up to 1040 px (Poppins 800 runs about 0.72 em a capital)
  const nameSize = Math.min(220, Math.floor(1040 / ((first.length + 1) * 0.72)));
  const to = landing && tile ? tile : HOME;

  return (
    <>
      {/* The brand's circle and triangle behind the avatar */}
      <m.div
        animate={{ scale: landing ? 0 : 1 }}
        className="absolute h-[300px] w-[300px] rounded-full bg-[#F5BB03]"
        exit={{ scale: 0 }}
        initial={{ scale: 0 }}
        style={{ left: HOME.left - 90, top: HOME.top - 60 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      />
      <m.svg
        animate={{ scale: landing ? 0 : 1 }}
        aria-hidden="true"
        className="absolute h-[260px] w-[260px]"
        exit={{ scale: 0 }}
        initial={{ scale: 0 }}
        style={{ left: HOME.left + HOME.size - 180, top: HOME.top + HOME.size - 170 }}
        transition={{ duration: 0.6, delay: landing ? 0 : 0.12, ease: EASE_OUT }}
        viewBox="0 0 100 100"
      >
        <polygon fill={BRAND.blue} points="97,3 97,97 3,97" />
      </m.svg>
      <m.div
        animate={{
          left: to.left,
          top: to.top,
          width: to.size,
          height: to.size,
          scale: 1,
          opacity: landing && !tile ? 0 : 1,
          // A black cut keeps a yellow or blue avatar apart from the shapes behind it
          boxShadow: `0 0 0 ${landing ? 0 : 14}px ${BRAND.black}`,
        }}
        className="absolute rounded-full"
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        initial={{
          left: HOME.left,
          top: HOME.top,
          width: HOME.size,
          height: HOME.size,
          scale: 0.4,
          opacity: 0,
          boxShadow: `0 0 0 14px ${BRAND.black}`,
        }}
        transition={
          landing ? { duration: (LAND_MS - 100) / 1000, ease: [0.65, 0, 0.35, 1] } : { duration: 0.7, ease: EASE_OUT }
        }
      >
        <Avatar loaded={loaded} person={person} />
      </m.div>
      <m.div
        animate={{ opacity: landing ? 0 : 1, x: 0 }}
        className="absolute top-[330px] left-[780px] w-[1040px]"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <p className="text-[96px] leading-none font-bold text-[#FBF5E7]">¡Hola,</p>
        <p
          className="mt-3 leading-[0.95] font-extrabold tracking-[-0.02em] whitespace-nowrap text-[#F5BB03] uppercase"
          style={{ fontSize: nameSize }}
        >
          {first}!
        </p>
        <p className="mt-8 text-[48px] leading-tight font-semibold text-[#FBF5E7]/75">{subtitle}</p>
      </m.div>
    </>
  );
}

export function WelcomeWall({ params, eventId }: SceneProps<"welcome-wall">) {
  const { preview } = useContext(StageContext);
  const list = useArrivals(eventId, preview);
  const { hello, pending } = useHellos(list);
  const people = list ?? [];
  const layout = useMemo(() => wallLayout(people.length), [people.length]);
  const loaded = useRef(new Map<string, boolean>()).current;
  // Tiles from the first read pop in one by one; later ones arrive by hello
  const first = useRef<Set<string> | null>(null);
  if (list && !first.current) first.current = new Set(list.map((person) => person.id));
  const landed = people.filter((person) => !pending.has(person.id));
  const newest = landed.at(-1)?.id;
  const helloIndex = hello ? people.findIndex((person) => person.id === hello.person.id) : -1;

  return (
    <>
      <div className="absolute top-[96px] left-[120px] w-[1300px]">
        <Rise
          className={`${params.title.length > 26 ? "text-[56px]" : "text-[76px]"} leading-none font-extrabold tracking-[-0.02em] text-balance uppercase`}
          delay={0.05}
        >
          {params.title}
        </Rise>
      </div>
      {list && list.length > 0 && (
        <div className="absolute top-[56px] right-[120px] text-right">
          <p className="countdown-font text-[140px] leading-none tracking-wider text-[#F5BB03]">{landed.length}</p>
          <p className="text-[26px] font-semibold tracking-[0.2em] text-[#FBF5E7]/60 uppercase">
            {landed.length === 1 ? "ya llegó" : "ya llegaron"}
          </p>
        </div>
      )}
      {(!eventId || list?.length === 0) && (
        <p className="absolute inset-x-[160px] top-1/2 -translate-y-1/2 text-center text-[56px] font-extrabold text-[#FBF5E7]/40 uppercase">
          {eventId ? "Esperando a los primeros…" : "Elegí un evento en el admin"}
        </p>
      )}
      <m.div
        animate={{ opacity: hello && !hello.landing ? 0.12 : 1 }}
        className="absolute inset-0"
        transition={{ duration: 0.5 }}
      >
        {people.map((person, i) => {
          const tile = layout.tile(i);
          if (!tile || pending.has(person.id)) return null;
          const popIn = first.current?.has(person.id);

          return (
            <m.div
              key={person.id}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute transition-[left,top,width,height] duration-700 ease-out"
              initial={popIn ? { opacity: 0, scale: 0.5 } : false}
              style={{
                left: tile.left,
                top: tile.top,
                width: tile.size,
                height: tile.size,
                // The last one in wears the yellow ring until the next arrives
                boxShadow:
                  person.id === newest && !popIn ? `0 0 0 ${Math.max(3, tile.size / 30)}px ${BRAND.yellow}` : undefined,
                borderRadius: "9999px",
              }}
              transition={{ duration: 0.5, delay: popIn ? 0.3 + Math.min(i * 0.012, 1.6) : 0, ease: EASE_OUT }}
            >
              <Avatar loaded={loaded} person={person} />
            </m.div>
          );
        })}
      </m.div>
      <AnimatePresence>
        {hello && (
          <Hello
            key={hello.person.id}
            landing={hello.landing}
            loaded={loaded}
            person={hello.person}
            subtitle={params.subtitle}
            tile={helloIndex >= 0 ? layout.tile(helloIndex) : null}
          />
        )}
      </AnimatePresence>
    </>
  );
}
