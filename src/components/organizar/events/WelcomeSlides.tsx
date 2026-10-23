"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Maximize, Printer, X } from "lucide-react";

import { QrCode } from "components/Admin/comms/QrCode";
import { Button } from "components/shared/ui/button";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { Slides } from "lib/orpc/events/schemas";

/** Printing: only the deck, one slide per page */
const PRINT = `@media print {
  body > *:not([data-slides]) { display: none !important; }
  [data-slides] { position: static !important; background: #000 !important; }
  [data-slide] { display: flex !important; height: 100vh; break-after: page; }
  [data-slides-controls] { display: none !important; }
  @page { size: landscape; margin: 0; }
}`;

const list = new Intl.ListFormat("es", { type: "conjunction" });
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

type Slide = { key: string; title: string; body: React.ReactNode };

function Title({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-title text-[clamp(2.5rem,6.5vw,6rem)] leading-[1.05] font-bold text-balance text-white">
        {children}
      </h2>
      <span aria-hidden className="mt-6 block h-2 w-24 rounded-full bg-yellow-400" />
    </>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-8 max-w-5xl text-[clamp(1.5rem,3.4vw,3rem)] leading-snug text-pretty text-zinc-200">{children}</p>
);

/** A QR big enough to scan from the back rows, with its address under it */
function Qr({ url, title }: { url: string; title: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-4">
        <QrCode className="size-[min(32vh,22vw)]" size={320} title={title} value={url} />
      </div>
      <p className="max-w-[min(40vh,28vw)] text-center font-terminal text-[clamp(0.9rem,1.4vw,1.25rem)] break-all text-zinc-300">
        {shortUrl(url)}
      </p>
    </div>
  );
}

/** The deck, from what the event has: slides without content (no wifi, no host) are left out. */
function slidesOf(data: Slides): Slide[] {
  const wifi = data.notes.wifiName || data.notes.wifiPassword;
  const access = data.notes.access || data.reminderNote;
  const thanks = [data.venue?.name, ...data.cohosts].filter((name): name is string => Boolean(name));

  return [
    {
      key: "bienvenida",
      title: "Bienvenida",
      body: (
        <div>
          <p className="flex items-center gap-4 text-[clamp(1.25rem,2.6vw,2.25rem)] font-medium text-zinc-300">
            {data.community.logoUrl ? (
              // oxlint-disable-next-line nextjs/no-img-element -- a community's logo from anywhere, at any size
              <img
                alt=""
                className="size-[clamp(3rem,6vw,5rem)] rounded-xl object-cover"
                src={data.community.logoUrl}
              />
            ) : null}
            {data.community.name}
          </p>
          <div className="mt-6">
            <Title>{data.name}</Title>
          </div>
          <Big>{shortWhen(data.startDate)}</Big>
        </div>
      ),
    },
    ...(wifi || access
      ? [
          {
            key: "wifi",
            title: "Wifi y cómo moverse",
            body: (
              <div>
                <Title>{wifi ? "Wifi" : "Para moverse"}</Title>
                {wifi ? (
                  <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[clamp(1.75rem,4vw,3.5rem)]">
                    {data.notes.wifiName ? (
                      <>
                        <dt className="text-zinc-400">Red</dt>
                        <dd className="font-terminal font-semibold text-white">{data.notes.wifiName}</dd>
                      </>
                    ) : null}
                    {data.notes.wifiPassword ? (
                      <>
                        <dt className="text-zinc-400">Contraseña</dt>
                        <dd className="font-terminal font-semibold text-white">{data.notes.wifiPassword}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                {access ? <Big>{access}</Big> : null}
              </div>
            ),
          },
        ]
      : []),
    {
      key: "conducta",
      title: "Código de conducta",
      body: (
        <div className="flex flex-wrap items-center gap-12">
          <div className="min-w-0 flex-1">
            <Title>Un lugar para todas las personas</Title>
            <Big>
              {data.responders.length > 0
                ? `Si algo no está bien, hablá con ${list.format(data.responders)}.`
                : "Si algo no está bien, hablá con quien organiza."}{" "}
              También podés reportarlo sin dar tu nombre.
            </Big>
          </div>
          <Qr title="QR para reportar un problema" url={data.reportUrl} />
        </div>
      ),
    },
    {
      key: "fotos",
      title: "Fotos",
      body: (
        <div>
          <Title>Vamos a sacar fotos</Title>
          <Big>Si no querés salir, avisanos: no te sacamos, y si salís en alguna, la borramos.</Big>
        </div>
      ),
    },
    ...(thanks.length > 0
      ? [
          {
            key: "gracias",
            title: "Gracias",
            body: (
              <div>
                {data.venue?.logoUrl ? (
                  // oxlint-disable-next-line nextjs/no-img-element -- the host's logo, from wherever they keep it
                  <img
                    alt={`Logo de ${data.venue.name}`}
                    className="mb-10 max-h-[22vh] max-w-[40vw] rounded-xl bg-white object-contain p-4"
                    src={data.venue.logoUrl}
                  />
                ) : null}
                <Title>Gracias a {list.format(thanks)}</Title>
                {data.venue ? <Big>Por abrirnos la puerta esta noche.</Big> : null}
              </div>
            ),
          },
        ]
      : []),
    ...(data.agenda.length > 0
      ? [
          {
            key: "agenda",
            title: "La agenda",
            body: (
              <div className="w-full">
                <Title>La agenda</Title>
                <ol className="mt-8 flex flex-col gap-2 text-[clamp(1.25rem,2.6vw,2.4rem)]">
                  {data.agenda.map((item) => (
                    <li key={`${item.plannedStart}-${item.title}`} className="flex gap-6">
                      <span className="font-terminal text-zinc-400 tabular-nums">{item.plannedStart}</span>
                      <span className="min-w-0 text-white">{item.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ),
          },
        ]
      : []),
    ...(data.next
      ? [
          {
            key: "proximo",
            title: "El próximo",
            body: (
              <div className="flex flex-wrap items-center gap-12">
                <div className="min-w-0 flex-1">
                  <p className="text-[clamp(1.25rem,2.6vw,2.25rem)] font-medium text-zinc-300">El próximo</p>
                  <div className="mt-4">
                    <Title>{data.next.name}</Title>
                  </div>
                  <Big>{shortWhen(data.next.startDate)}</Big>
                </div>
                <Qr title="QR del próximo evento" url={data.next.url} />
              </div>
            ),
          },
        ]
      : []),
    {
      key: "encuesta",
      title: "Encuesta",
      body: data.surveyUrl ? (
        <div className="flex flex-wrap items-center gap-12">
          <div className="min-w-0 flex-1">
            <Title>¿Qué te pareció?</Title>
            <Big>Son dos minutos y nos ayuda a armar el próximo. También te llega por mail.</Big>
          </div>
          <Qr title="QR de la encuesta" url={data.surveyUrl} />
        </div>
      ) : (
        <div>
          <Title>¡Gracias por venir!</Title>
          <Big>Nos vemos en el próximo.</Big>
        </div>
      ),
    },
  ];
}

/**
 * The welcome slides, full screen: ← → (or a tap) to move, f for full screen, printable one slide
 * per page. Built from the event; huge type for the back of the room, one yellow accent, no motion.
 */
export function WelcomeSlides({
  communityId,
  eventId,
  backHref,
}: {
  communityId: string;
  eventId: string;
  backHref: string;
}) {
  const data = useQuery(orpc.events.slides.queryOptions({ input: { communityId, eventId } }));
  const [at, setAt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const slides = data.data ? slidesOf(data.data) : [];
  const count = slides.length;
  const move = (by: number) => setAt((current) => Math.min(Math.max(current + by, 0), Math.max(count - 1, 0)));

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) move(1);
      else if (["ArrowLeft", "PageUp"].includes(event.key)) move(-1);
      else if (event.key === "Home") setAt(0);
      else if (event.key === "End") setAt(Math.max(count - 1, 0));
      else if (event.key === "f") void document.documentElement.requestFullscreen?.().catch(() => undefined);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- move only reads the count
  }, [count]);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-label="Presentación de bienvenida"
      aria-roledescription="presentación"
      className="fixed inset-0 z-[60] flex flex-col bg-black font-sans text-white"
      data-slides
      role="region"
    >
      <style>{PRINT}</style>
      {data.isError ? (
        <div className="m-auto max-w-lg p-8 text-center" role="alert">
          <p className="text-2xl">No pudimos armar la presentación.</p>
          <p className="mt-2 text-zinc-400">Revisá la conexión y recargá la página.</p>
        </div>
      ) : !data.data ? (
        <p className="m-auto text-2xl text-zinc-400">Armando la presentación…</p>
      ) : (
        <div className="relative min-h-0 flex-1">
          {slides.map((slide, index) => (
            <section
              key={slide.key}
              aria-hidden={index !== at}
              aria-label={`${index + 1} de ${count}: ${slide.title}`}
              aria-roledescription="diapositiva"
              className={
                index === at
                  ? "absolute inset-0 flex items-center px-[7vw] py-[8vh]"
                  : "hidden items-center px-[7vw] py-[8vh]"
              }
              data-slide
              onClick={() => move(1)}
            >
              {slide.body}
            </section>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2 text-zinc-300" data-slides-controls>
        <Button asChild aria-label="Salir de la presentación" size="icon" variant="ghost">
          <Link href={backHref}>
            <X />
          </Link>
        </Button>
        <span aria-live="polite" className="font-terminal text-sm tabular-nums" data-testid="slide-counter">
          {count ? `${at + 1} / ${count}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button aria-label="Imprimir" size="icon" variant="ghost" onClick={() => window.print()}>
            <Printer />
          </Button>
          <Button
            aria-label="Pantalla completa"
            size="icon"
            variant="ghost"
            onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
          >
            <Maximize />
          </Button>
          <Button aria-label="Anterior" disabled={at === 0} size="icon" variant="ghost" onClick={() => move(-1)}>
            <ChevronLeft />
          </Button>
          <Button aria-label="Siguiente" disabled={at >= count - 1} size="icon" variant="ghost" onClick={() => move(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
