"use client";

import { useContext, useMemo } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";
import { roomColorFor } from "lib/rooms/palette";

import { StageContext, useCanvas } from "../Stage";
import { ACCENTS, AGILES, AgilesCard, AgilesFrame, AgilesHeader, AgilesLogo, Bars } from "./agiles";
import { useBoard, useNow } from "./useful";

/**
 * The open space half of Ágiles Uruguay 2026: the scenes that explain the
 * format, run the marketplace and then show the grid the room itself built.
 * The grid and room scenes read the live board (salas, bloques, tarjetas) from
 * the admin, so whatever staff moves there shows up on the wall.
 *
 * Like the rest of the Ágiles set, these size themselves from the stage canvas
 * — UCU's wall is a 3584×960 strip, not 16:9.
 */

const BODY = "font-['Open_Sans']";

const splitList = (value: string) =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

function Empty({ text }: { text: string }) {
  const { u } = useCanvas();

  return (
    <AgilesFrame plain>
      <p
        className={`flex flex-1 items-center justify-center text-center text-white/40 ${BODY}`}
        style={{ fontSize: Math.round(52 * u) }}
      >
        {text}
      </p>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Qué es un open space
// ---------------------------------------------------------------------------

export function OsIntro({ params }: SceneProps<"agiles-os-intro">) {
  const { u, wide } = useCanvas();

  return (
    <AgilesFrame logo={false} plain>
      <AgilesHeader eyebrow="Cómo funciona" title={params.title} />
      <div
        className={`flex flex-1 ${wide ? "flex-row items-center" : "flex-col justify-center"}`}
        style={{ gap: wide ? "6%" : Math.round(60 * u), marginTop: Math.round(30 * u) }}
      >
        <m.p
          animate={{ opacity: 1, y: 0 }}
          className={`text-balance ${wide ? "flex-[1.2]" : ""} ${BODY}`}
          initial={{ opacity: 0, y: 24 }}
          style={{ fontSize: Math.round((wide ? 50 : 54) * u), lineHeight: 1.25 }}
          transition={{ duration: 0.7, delay: 0.2, ease: EASE_OUT }}
        >
          {params.text}
        </m.p>
        <m.div
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center ${wide ? "flex-1" : ""}`}
          initial={{ opacity: 0, y: 24 }}
          style={{
            gap: Math.round(40 * u),
            padding: `${Math.round(40 * u)}px ${Math.round(48 * u)}px`,
            borderRadius: Math.round(18 * u),
            background: "rgba(255,225,90,0.1)",
            borderLeft: `${Math.round(10 * u)}px solid ${AGILES.yellow}`,
          }}
          transition={{ duration: 0.7, delay: 0.4, ease: EASE_OUT }}
        >
          <span style={{ fontSize: Math.round(72 * u) }}>🦶</span>
          <p className={`font-semibold ${BODY}`} style={{ fontSize: Math.round(44 * u), lineHeight: 1.25 }}>
            {params.law}
          </p>
        </m.div>
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Principios
// ---------------------------------------------------------------------------

export function OsPrinciples({ params }: SceneProps<"agiles-os-principles">) {
  const { u, wide } = useCanvas();
  const items = useMemo(() => splitList(params.items), [params.items]);

  return (
    <AgilesFrame logo={false} plain>
      <AgilesHeader eyebrow="Open space" title="Principios" />
      <div
        className="grid flex-1 items-stretch"
        style={{
          gridTemplateColumns: `repeat(${wide ? 4 : 2}, minmax(0, 1fr))`,
          gridAutoRows: "1fr",
          gap: Math.round(24 * u),
          marginTop: Math.round(30 * u),
        }}
      >
        {items.slice(0, 4).map((item, i) => (
          <AgilesCard key={item} className="h-full" delay={0.2 + i * 0.08} index={i} title={item} />
        ))}
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export function OsMarketplace({ params }: SceneProps<"agiles-os-marketplace">) {
  const { u } = useCanvas();
  const items = useMemo(() => splitList(params.items), [params.items]);

  return (
    <AgilesFrame logo={false} plain>
      <AgilesHeader eyebrow="Marketplace" title={params.title} />
      <div
        className="grid flex-1 items-stretch"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gridAutoRows: "1fr",
          gap: Math.round(24 * u),
          marginTop: Math.round(30 * u),
        }}
      >
        {items.slice(0, 3).map((item, i) => {
          const [title, ...rest] = item.split(":");

          return (
            <AgilesCard
              key={item}
              className="h-full"
              delay={0.2 + i * 0.1}
              index={i}
              text={rest.join(":").trim() || undefined}
              title={title.trim()}
            />
          );
        })}
      </div>
      <p className={`shrink-0 text-white/55 ${BODY}`} style={{ fontSize: Math.round(32 * u) }}>
        Quien propone, facilita. No hace falta ser experta ni experto: alcanza con querer la conversación.
      </p>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Grilla en vivo
// ---------------------------------------------------------------------------

export function OsBoard({ params, eventId }: SceneProps<"agiles-os-board">) {
  const { preview } = useContext(StageContext);
  const { u, wide } = useCanvas();
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);

  if (!eventId) return <Empty text="Elegí el evento en el admin para ver la grilla" />;
  if (!data) return null;

  const rooms = data.rooms.filter((room) => room.isActive !== false).slice(0, wide ? 8 : 6);
  const slots = data.schedules
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 5);

  if (rooms.length === 0 || slots.length === 0) {
    return <Empty text="La grilla todavía está vacía: cargá salas y bloques en el admin" />;
  }

  return (
    <AgilesFrame logo={false} plain>
      <header className="flex w-full shrink-0 items-end justify-between">
        <div className="flex items-end" style={{ gap: Math.round(32 * u) }}>
          <div>
            <p
              className={`font-bold tracking-[0.34em] uppercase ${BODY}`}
              style={{ color: AGILES.yellow, fontSize: Math.round(24 * u) }}
            >
              Open space
            </p>
            <h1
              className="font-display leading-none font-extrabold uppercase"
              style={{ fontSize: Math.round(76 * u), marginTop: Math.round(8 * u) }}
            >
              {params.title}
            </h1>
          </div>
          <p
            className="font-display font-extrabold text-white/55 tabular-nums"
            style={{ fontSize: Math.round(44 * u) }}
          >
            {now}
          </p>
        </div>
        <AgilesLogo className="opacity-85" width={280} />
      </header>

      <div
        className="grid flex-1"
        style={{
          gridTemplateColumns: `${Math.round(160 * u)}px repeat(${rooms.length}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${slots.length}, minmax(0, 1fr))`,
          gap: Math.round(12 * u),
          marginTop: Math.round(32 * u),
        }}
      >
        <span />
        {rooms.map((room, i) => (
          <div
            key={room.id}
            className="truncate text-center"
            style={{
              background: `${roomColorFor(room.id, room.color)}26`,
              borderBottom: `${Math.round(6 * u)}px solid ${ACCENTS[i % ACCENTS.length]}`,
              borderRadius: `${Math.round(12 * u)}px ${Math.round(12 * u)}px 0 0`,
              padding: `${Math.round(14 * u)}px ${Math.round(18 * u)}px`,
            }}
          >
            <span className="font-display font-extrabold uppercase" style={{ fontSize: Math.round(30 * u) }}>
              {room.name}
            </span>
          </div>
        ))}
        {slots.map((slot) => {
          const isNow = slot.startTime <= now && now < slot.endTime;

          return (
            <div key={slot.id} className="contents">
              <div className="flex flex-col justify-center" style={{ paddingBlock: Math.round(10 * u) }}>
                <span
                  className="font-display font-extrabold tabular-nums"
                  style={{ fontSize: Math.round(34 * u), color: isNow ? AGILES.yellow : AGILES.cream }}
                >
                  {slot.startTime}
                </span>
                <span className={`text-white/45 tabular-nums ${BODY}`} style={{ fontSize: Math.round(22 * u) }}>
                  {slot.endTime}
                </span>
              </div>
              {rooms.map((room) => {
                const note = data.tracks.find((track) => track.roomId === room.id && track.scheduleId === slot.id);

                return (
                  <div
                    key={`${slot.id}-${room.id}`}
                    className="flex flex-col justify-center"
                    style={{
                      minHeight: Math.round(108 * u),
                      borderRadius: Math.round(12 * u),
                      padding: `${Math.round(12 * u)}px ${Math.round(22 * u)}px`,
                      background: isNow ? "rgba(255,225,90,0.12)" : "rgba(255,255,255,0.04)",
                      outline: isNow ? `2px solid ${AGILES.yellow}66` : "none",
                    }}
                  >
                    {note ? (
                      <>
                        <span
                          className={`line-clamp-2 leading-tight font-semibold ${BODY}`}
                          style={{ fontSize: Math.round(28 * u) }}
                        >
                          {note.title}
                        </span>
                        {note.speaker && (
                          <span
                            className={`truncate text-white/55 ${BODY}`}
                            style={{ fontSize: Math.round(22 * u), marginTop: Math.round(4 * u) }}
                          >
                            {note.speaker}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className={`text-white/25 ${BODY}`} style={{ fontSize: Math.round(24 * u) }}>
                        libre
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Sala
// ---------------------------------------------------------------------------

export function OsRoom({ params, eventId }: SceneProps<"agiles-os-room">) {
  const { preview } = useContext(StageContext);
  const { u, wide } = useCanvas();
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);

  if (!eventId) return <Empty text="Elegí el evento en el admin" />;
  if (!data) return null;

  const wanted = params.room.trim().toLowerCase();
  const room = data.rooms.find((candidate) => candidate.name.trim().toLowerCase() === wanted);
  if (!room) {
    return <Empty text={`No existe la sala "${params.room}" · ${data.rooms.map((r) => r.name).join(" · ")}`} />;
  }

  const slots = data.schedules
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, wide ? 8 : 7);
  // On a strip the day reads better as two columns than as one long list.
  const perColumn = wide ? Math.ceil(slots.length / 2) : slots.length;
  const columns = wide ? [slots.slice(0, perColumn), slots.slice(perColumn)] : [slots];

  return (
    <AgilesFrame logo={false} plain>
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: Math.round(26 * u), background: roomColorFor(room.id, room.color) }}
      />
      <header className="flex w-full shrink-0 items-end justify-between">
        <div className="flex items-end" style={{ gap: Math.round(36 * u) }}>
          <div>
            <p
              className={`font-bold tracking-[0.34em] uppercase ${BODY}`}
              style={{ color: AGILES.yellow, fontSize: Math.round(24 * u) }}
            >
              Sala
            </p>
            <h1
              className="font-display leading-none font-extrabold uppercase"
              style={{ fontSize: Math.round(96 * u), marginTop: Math.round(8 * u) }}
            >
              {room.name}
            </h1>
          </div>
          <p
            className="font-display font-extrabold text-white/55 tabular-nums"
            style={{ fontSize: Math.round(44 * u) }}
          >
            {now}
          </p>
        </div>
        <AgilesLogo className="opacity-85" width={280} />
      </header>

      <div className="flex flex-1 items-stretch" style={{ gap: Math.round(36 * u), marginTop: Math.round(36 * u) }}>
        {columns.map((column, columnIndex) => (
          <ul
            key={columnIndex}
            className={`flex min-w-0 flex-1 flex-col ${wide ? "justify-between" : ""}`}
            style={{ gap: Math.round(12 * u) }}
          >
            {column.map((slot, i) => {
              const note = data.tracks.find((track) => track.roomId === room.id && track.scheduleId === slot.id);
              const isNow = slot.startTime <= now && now < slot.endTime;
              const past = slot.endTime <= now;

              return (
                <m.li
                  key={slot.id}
                  animate={{ opacity: past ? 0.35 : 1, x: 0 }}
                  className="flex items-center"
                  initial={{ opacity: 0, x: -20 }}
                  style={{
                    gap: Math.round(30 * u),
                    padding: `${Math.round(16 * u)}px ${Math.round(30 * u)}px`,
                    borderRadius: Math.round(14 * u),
                    background: isNow ? "rgba(255,225,90,0.12)" : "rgba(255,255,255,0.035)",
                    borderLeft: `${Math.round(8 * u)}px solid ${isNow ? AGILES.yellow : "rgba(252,252,252,0.16)"}`,
                  }}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.05, ease: EASE_OUT }}
                >
                  <span
                    className="shrink-0 font-display font-extrabold tabular-nums"
                    style={{
                      width: Math.round(250 * u),
                      fontSize: Math.round(36 * u),
                      color: isNow ? AGILES.yellow : AGILES.cream,
                    }}
                  >
                    {slot.startTime} – {slot.endTime}
                  </span>
                  {note ? (
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate leading-tight font-semibold ${BODY}`}
                        style={{ fontSize: Math.round(38 * u) }}
                      >
                        {note.title}
                      </span>
                      {note.speaker && (
                        <span
                          className={`block truncate text-white/55 ${BODY}`}
                          style={{ fontSize: Math.round(24 * u) }}
                        >
                          {note.speaker}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className={`text-white/25 ${BODY}`} style={{ fontSize: Math.round(30 * u) }}>
                      libre
                    </span>
                  )}
                </m.li>
              );
            })}
          </ul>
        ))}
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Rondas
// ---------------------------------------------------------------------------

type Round = { start: string; end: string };

function parseRounds(value: string): Round[] {
  return splitList(value)
    .map((item) => item.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ start: match[1].padStart(5, "0"), end: match[2].padStart(5, "0") }));
}

/** Minutes between two HH:MM, floored at zero. */
function minutesBetween(from: string, to: string): number {
  const [fromHours, fromMinutes] = from.split(":").map(Number);
  const [toHours, toMinutes] = to.split(":").map(Number);

  return Math.max(0, toHours * 60 + toMinutes - (fromHours * 60 + fromMinutes));
}

export function OsRounds({ params }: SceneProps<"agiles-os-rounds">) {
  const { h, u, wide } = useCanvas();
  const now = useNow(1000);
  const rounds = useMemo(() => parseRounds(params.rounds), [params.rounds]);
  const active = rounds.findIndex((round) => round.start <= now && now < round.end);
  const next = rounds.find((round) => round.start > now);
  const over = rounds.length > 0 && now >= rounds[rounds.length - 1].end;

  return (
    <AgilesFrame logo={false} plain>
      <AgilesHeader eyebrow={`Open space · ${now}`} title={active >= 0 ? `Ronda ${active + 1}` : "Rondas"} />
      <div
        className={`flex flex-1 ${wide ? "flex-row items-center" : "flex-col justify-center"}`}
        style={{ gap: wide ? "6%" : Math.round(50 * u), marginTop: Math.round(24 * u) }}
      >
        <div className={wide ? "flex-1" : ""}>
          {active >= 0 ? (
            <m.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT }}
            >
              <p
                className={`font-bold tracking-[0.3em] text-white/55 uppercase ${BODY}`}
                style={{ fontSize: Math.round(30 * u) }}
              >
                Quedan
              </p>
              <p
                className="font-display leading-none font-extrabold tabular-nums"
                style={{ color: AGILES.yellow, fontSize: Math.round(h * (wide ? 0.3 : 0.2)) }}
              >
                {minutesBetween(now, rounds[active].end)}
                <span style={{ fontSize: Math.round(70 * u), marginLeft: Math.round(20 * u) }}>min</span>
              </p>
              <p
                className={`font-semibold text-white/60 tabular-nums ${BODY}`}
                style={{ fontSize: Math.round(40 * u), marginTop: Math.round(12 * u) }}
              >
                {rounds[active].start} – {rounds[active].end}
              </p>
            </m.div>
          ) : (
            <div>
              <p className={`font-semibold ${BODY}`} style={{ fontSize: Math.round(64 * u), lineHeight: 1.15 }}>
                {over ? "Terminaron las rondas: nos vemos en el cierre" : "La próxima ronda está por empezar"}
              </p>
              {next && (
                <p
                  className={`text-white/60 ${BODY}`}
                  style={{ fontSize: Math.round(38 * u), marginTop: Math.round(24 * u) }}
                >
                  Empieza a las {next.start} · faltan {minutesBetween(now, next.start)} min
                </p>
              )}
            </div>
          )}
        </div>

        <div className={wide ? "flex-1" : ""}>
          <Bars width={190} />
          <ul className="flex flex-wrap" style={{ gap: Math.round(16 * u), marginTop: Math.round(28 * u) }}>
            {rounds.map((round, i) => {
              const isActive = i === active;
              const past = now >= round.end;

              return (
                <li
                  key={`${round.start}-${round.end}`}
                  style={{
                    padding: `${Math.round(22 * u)}px ${Math.round(36 * u)}px`,
                    borderRadius: Math.round(14 * u),
                    background: isActive ? "rgba(255,225,90,0.14)" : "rgba(255,255,255,0.04)",
                    borderBottom: `${Math.round(6 * u)}px solid ${
                      isActive ? AGILES.yellow : ACCENTS[i % ACCENTS.length]
                    }`,
                    opacity: past && !isActive ? 0.35 : 1,
                  }}
                >
                  <p
                    className={`font-bold tracking-[0.25em] text-white/55 uppercase ${BODY}`}
                    style={{ fontSize: Math.round(22 * u) }}
                  >
                    Ronda {i + 1}
                  </p>
                  <p
                    className="font-display font-extrabold tabular-nums"
                    style={{ fontSize: Math.round(40 * u), marginTop: Math.round(8 * u) }}
                  >
                    {round.start} – {round.end}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Cierre del open space
// ---------------------------------------------------------------------------

export function OsClosing({ params }: SceneProps<"agiles-os-closing">) {
  const { u, wide } = useCanvas();
  const items = useMemo(() => splitList(params.items), [params.items]);

  return (
    <AgilesFrame logo={false} plain>
      <AgilesHeader eyebrow="Open space" title={params.title} />
      <ul
        className="grid flex-1 items-stretch"
        style={{
          gridTemplateColumns: `repeat(${wide ? 2 : 1}, minmax(0, 1fr))`,
          gridAutoRows: "1fr",
          gap: Math.round(20 * u),
          marginTop: Math.round(30 * u),
        }}
      >
        {items.slice(0, 4).map((item, i) => (
          <m.li
            key={item}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center bg-white/[0.045]"
            initial={{ opacity: 0, x: -24 }}
            style={{
              gap: Math.round(32 * u),
              padding: `${Math.round(32 * u)}px ${Math.round(44 * u)}px`,
              borderRadius: Math.round(16 * u),
              borderLeft: `${Math.round(10 * u)}px solid ${ACCENTS[i % ACCENTS.length]}`,
            }}
            transition={{ duration: 0.55, delay: 0.2 + i * 0.1, ease: EASE_OUT }}
          >
            <span
              className="font-display font-extrabold"
              style={{ color: ACCENTS[i % ACCENTS.length], fontSize: Math.round(34 * u) }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className={`leading-tight font-semibold ${BODY}`} style={{ fontSize: Math.round(44 * u) }}>
              {item}
            </span>
          </m.li>
        ))}
      </ul>
    </AgilesFrame>
  );
}
