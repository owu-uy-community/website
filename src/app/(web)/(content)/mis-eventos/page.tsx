import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { auth } from "app/lib/auth";
import { cn } from "app/lib/utils";
import { Badge, cardClassName, Container, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { dateParts, shortWhen } from "lib/community/time";
import { pageMetadata } from "lib/community/metadata";
import { callerFor } from "lib/orpc/server";

import { DeleteAccount } from "./DeleteAccount";

export const dynamic = "force-dynamic";
export const metadata = {
  ...pageMetadata({
    title: "Mis eventos",
    description: "Los eventos a los que te anotaste en OWU.",
    path: "/mis-eventos",
  }),
  robots: { index: false, follow: false },
};

const STATUS: Record<string, { label: string; accent?: boolean }> = {
  attending: { label: "Anotado" },
  offered: { label: "Hay un lugar para vos", accent: true },
  waitlisted: { label: "Lista de espera" },
  pending: { label: "Esperando aprobación" },
  cancelled: { label: "Liberado" },
  declined: { label: "No confirmado" },
};

/** Every event the person signed up for: offers to confirm first, then what's next, then the past. */
export default async function MyEventsPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/login?next=/mis-eventos");
  const list = await callerFor(requestHeaders).rsvps.myEvents();
  const now = Date.now();
  const upcoming = list.filter((item) => Date.parse(item.event.startDate) >= now - 3 * 3_600_000);
  const past = list.filter((item) => !upcoming.includes(item));

  return (
    <>
      <PageHeader
        description="Tus entradas, tu lugar en las listas de espera y lo que ya pasó."
        eyebrow="Tu cuenta"
        title="Mis eventos"
      />
      <Container className="pb-24">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {list.length === 0 ? (
            <p className={cardClassName(false, "p-6 text-zinc-300")}>
              Todavía no te anotaste a ningún evento.{" "}
              <Link className="text-yellow-400 underline underline-offset-4" href="/eventos">
                Mirá la agenda
              </Link>
              .
            </p>
          ) : null}
          {[...upcoming, ...past].map(({ event, rsvp }) => {
            const parts = dateParts(event.startDate);
            const status = STATUS[rsvp.status];
            const gone = past.some((item) => item.event.id === event.id);

            return (
              <Link
                key={event.id}
                className={cardClassName(true, cn("flex items-center gap-4 p-4 sm:p-5", gone && "opacity-60"))}
                href={`/comunidad/${event.community.slug}/events/${event.slug}/entrada`}
              >
                <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <span className="text-[10px] font-medium tracking-[0.12em] text-yellow-400 uppercase">
                    {parts.month}
                  </span>
                  <span className="font-title text-xl leading-none font-bold text-white">{parts.day}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">{event.name}</span>
                  <span className="block truncate text-[14px] text-zinc-400">
                    {event.community.name} · {shortWhen(event.startDate)}
                    {event.status === "cancelled" ? " · cancelado" : ""}
                  </span>
                </span>
                {status ? <Badge tone={status.accent ? "accent" : "neutral"}>{status.label}</Badge> : null}
                <ArrowRight aria-hidden className="size-4 shrink-0 text-zinc-500" />
              </Link>
            );
          })}
        </div>
        <div className="mx-auto mt-16 max-w-3xl">
          <DeleteAccount />
        </div>
      </Container>
      <Footer />
    </>
  );
}
