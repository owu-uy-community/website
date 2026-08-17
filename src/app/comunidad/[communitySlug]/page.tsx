import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarDays } from "lucide-react";

import { landingFor } from "components/community-landings/registry";
import { getCommunityBySlug, listCommunityEvents } from "lib/tenant-server";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/**
 * Community home: a bespoke landing from the registry when the community has
 * one, otherwise this generic profile listing their events.
 */
export default async function CommunityHomePage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const community = await getCommunityBySlug(communitySlug);
  if (!community) notFound();

  const events = await listCommunityEvents(community.id);

  const Landing = landingFor(community.slug);
  if (Landing) return <Landing community={community} events={events} />;

  return (
    <main className="min-h-screen bg-[#18181b] px-6 py-16 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-yellow-400 font-bold text-black">
            {community.name.slice(0, 3).toUpperCase()}
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{community.name}</h1>
            {community.description ? <p className="mt-1 text-zinc-400">{community.description}</p> : null}
          </div>
        </header>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-zinc-500">
            <CalendarDays aria-hidden className="h-4 w-4" />
            Eventos
          </h2>
          {events.length === 0 ? (
            <p className="mt-4 text-zinc-400">Todavía no hay eventos publicados.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {events.map((event) => (
                <li key={event.id}>
                  <Link
                    className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-5 py-4 transition-colors hover:border-yellow-400/50"
                    href={`/comunidad/${community.slug}/events/${event.slug}/openspace`}
                  >
                    <div>
                      <p className="font-semibold group-hover:text-yellow-400">{event.name}</p>
                      <p className="text-sm text-zinc-400">{formatDate(event.startDate)}</p>
                    </div>
                    <ArrowUpRight aria-hidden className="h-5 w-5 text-zinc-500 group-hover:text-yellow-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-16 border-t border-white/10 pt-6 text-sm text-zinc-500">
          Comunidad en{" "}
          <a className="text-zinc-300 underline-offset-4 hover:underline" href="https://owu.uy">
            owu.uy
          </a>
        </footer>
      </div>
    </main>
  );
}
