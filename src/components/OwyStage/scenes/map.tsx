"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";
import { FLOORPLAN } from "lib/rooms/floorplan";
import { assignMapZones, MAP_ZONES } from "lib/rooms/map-zones";
import { readableOn, roomColorFor } from "lib/rooms/palette";
import { formatCountdown } from "lib/utils";

import { StageContext } from "../Stage";
import { Rise } from "./parts";
import { EmptyText, secondsUntil, useBoard, useNow } from "./useful";

/** How long each room stays lit: five rooms go round in half a minute, one loop step. */
const ROOM_MS = 6000;
/** The plan's box plus room for the lit room's thicker outline. */
const VIEW = `-6 -6 ${FLOORPLAN.width + 12} ${FLOORPLAN.height + 12}`;
const WHITE = "#FFFFFF";

const hhmm = (time: string) => time.slice(0, 5);

/** Ticks on its own, so the rest of the scene doesn't re-render every second. */
function Remaining({ until }: { until: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="text-[#F5BB03] tabular-nums">{formatCountdown(Math.max(0, secondsUntil(until)))}</span>;
}

/**
 * The venue floorplan with every room in its colour, one lit at a time with what's on there, the
 * way La Meetup's map kiosk walked the rooms. The block follows the clock (now, else next, else
 * the last one) and the lit room cycles through the rooms with a session in it, or every room
 * while the grid is still empty, so the scene also works as wayfinding before the market.
 */
export function FloorMap({ eventId }: SceneProps<"map">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);

  const rooms = useMemo(() => {
    const active = (data?.rooms ?? []).filter((room) => room.isActive);
    const zones = assignMapZones(active);
    return active
      .filter((room) => zones.has(room.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((room) => ({ ...room, zone: zones.get(room.id)!, color: roomColorFor(room.id, room.color) }));
  }, [data]);

  const slots = (data?.schedules ?? [])
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const current = slots.find((slot) => slot.startTime <= now && now < slot.endTime);
  const next = current ? undefined : slots.find((slot) => slot.startTime > now);
  const block = current ?? next ?? slots[slots.length - 1];
  const sessionIn = (roomId: string) =>
    block ? data?.tracks.find((track) => track.roomId === roomId && track.scheduleId === block.id) : undefined;

  const withSession = rooms.filter((room) => sessionIn(room.id));
  const cycle = withSession.length ? withSession : rooms;

  const [step, setStep] = useState(0);
  useEffect(() => {
    if (cycle.length < 2) return;
    const id = setInterval(() => setStep((n) => n + 1), ROOM_MS);
    return () => clearInterval(id);
  }, [cycle.length]);

  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  if (rooms.length === 0) return <EmptyText text="Las salas todavía no están cargadas" />;

  const lit = cycle[step % cycle.length];
  const session = sessionIn(lit.id);
  const zoneRoom = new Map(rooms.map((room) => [room.zone, room]));

  return (
    <>
      <div className="absolute top-[70px] left-[80px]">
        <Rise className="text-[72px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.05}>
          Dónde queda cada sala
        </Rise>
        {block && (
          <m.p
            animate={{ opacity: 1 }}
            className="mt-5 text-[34px] font-semibold text-[#FBF5E7]/70 tabular-nums"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {current ? "Ahora" : next ? "Próximo bloque" : "Último bloque"} · {hhmm(block.startTime)} –{" "}
            {hhmm(block.endTime)}
            {current ? (
              <>
                {" "}
                · termina en <Remaining until={hhmm(block.endTime)} />
              </>
            ) : next ? (
              <>
                {" "}
                · empieza en <Remaining until={hhmm(block.startTime)} />
              </>
            ) : null}
          </m.p>
        )}
      </div>

      <m.svg
        animate={{ opacity: 1, y: 0 }}
        aria-hidden="true"
        className="absolute top-[290px] left-[60px] h-[680px] w-[1240px] overflow-visible"
        initial={{ opacity: 0, y: 24 }}
        preserveAspectRatio="xMidYMid meet"
        transition={{ duration: 0.8, delay: 0.2, ease: EASE_OUT }}
        viewBox={VIEW}
      >
        {/* White line drawing, as on La Meetup's kiosk map: only the lit room takes colour */}
        {FLOORPLAN.hatched.map((d) => (
          <path key={d.slice(0, 24)} d={d} fill="none" stroke={WHITE} strokeWidth={1.5} />
        ))}
        <path d={FLOORPLAN.walls} fill="none" stroke={WHITE} strokeWidth={2} />
        <path d={FLOORPLAN.annex} fill="none" stroke={WHITE} strokeWidth={2} />

        {MAP_ZONES.map((zone) => {
          const room = zoneRoom.get(zone);
          const on = room?.id === lit.id;
          const [x, y] = FLOORPLAN.labels[zone];
          return (
            <g key={zone}>
              <path
                d={FLOORPLAN.rooms[zone]}
                fill={room?.color ?? "none"}
                fillOpacity={on ? 1 : 0}
                stroke={on && room ? room.color : WHITE}
                strokeWidth={2}
                style={{ transition: "fill-opacity 600ms ease-out, stroke 600ms ease-out" }}
              />
              {room && (
                <text
                  dominantBaseline="central"
                  fill={on ? readableOn(room.color) : WHITE}
                  fontSize={32}
                  fontWeight={800}
                  letterSpacing="0.08em"
                  style={{ transition: "fill 600ms ease-out" }}
                  textAnchor="middle"
                  x={x}
                  y={y}
                >
                  {room.name.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </m.svg>

      {/* The lit room: what's on in there, keyed so each room slides in */}
      <m.div
        key={lit.id}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-[290px] right-[80px] flex h-[680px] w-[500px] flex-col"
        initial={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      >
        <div className="h-[14px] w-[120px]" style={{ background: lit.color }} />
        <p className="mt-6 text-[88px] leading-none font-extrabold tracking-[-0.02em] uppercase">{lit.name}</p>
        {lit.status !== "open" && (
          <p className="mt-5 self-start bg-[#FBF5E7] px-4 py-1.5 text-[26px] font-bold tracking-[0.08em] text-black uppercase">
            {lit.status === "full" ? "Llena" : "Evacuar"}
          </p>
        )}
        {session ? (
          <>
            <p className="mt-8 line-clamp-5 text-[52px] leading-[1.1] font-bold text-balance">{session.title}</p>
            {session.speaker && <p className="mt-5 text-[30px] text-[#FBF5E7]/65">Propone {session.speaker}</p>}
          </>
        ) : (
          <>
            <p className="mt-8 text-[52px] leading-[1.1] font-bold text-[#FBF5E7]/40">Libre</p>
            {block && <p className="mt-4 text-[30px] text-[#FBF5E7]/65">Si tenés un tema, es tuya.</p>}
          </>
        )}
        <p className="mt-auto text-[26px] text-[#FBF5E7]/55">
          {[
            lit.capacity ? `${lit.capacity} personas` : null,
            lit.hasTV ? "Pantalla" : null,
            lit.hasWhiteboard ? "Pizarra" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </m.div>

      {/* Which room of the round is lit, in the rooms' own colours */}
      {cycle.length > 1 && (
        <div className="absolute right-[80px] bottom-[70px] flex w-[500px] gap-[10px]">
          {cycle.map((room) => (
            <div
              key={room.id}
              className="h-[8px] flex-1"
              style={{
                background: room.color,
                opacity: room.id === lit.id ? 1 : 0.25,
                transition: "opacity 600ms",
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
