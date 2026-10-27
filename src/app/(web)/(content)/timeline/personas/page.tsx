import { cacheLife } from "next/cache";
import Link from "next/link";

import { ButtonLink, Container, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getTimeline } from "lib/timeline/data";
import { ROLE_LABEL, yearSpan } from "lib/timeline/format";

import Avatar from "../Avatar";
import { personHref } from "../Organizers";

export const metadata = pageMetadata({
  title: "Quienes hacen la comunidad tech uruguaya",
  description:
    "Las personas y organizaciones detrás de cada meetup, conferencia y hackatón de la comunidad tech de Uruguay, y quienes dieron sus charlas, con todo lo que hizo cada una.",
  path: "/timeline/personas",
});

const number = new Intl.NumberFormat("es-UY");
const count = (value: number, one: string, many: string) => `${number.format(value)} ${value === 1 ? one : many}`;

export default async function PeoplePage() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { people, community } = getTimeline();
  // Who organized (or is on a group's team), with their faces; who only spoke, as names: they're
  // more than a thousand, and almost none has a photo
  const organizers = people.filter((person) => person.events || person.roles);
  const speakers = people
    .filter((person) => !person.events && !person.roles)
    .toSorted((a, b) => (b.talks ?? 0) - (a.talks ?? 0) || a.name.localeCompare(b.name, "es"));

  return (
    <>
      <main>
        <PageHeader
          actions={
            <ButtonLink href="/timeline" variant="secondary">
              Volver a la historia
            </ButtonLink>
          }
          description={
            <>
              {number.format(organizers.length)} personas y organizaciones que organizaron los eventos de la historia
              (quienes los anunciaron en Meetup, el equipo de cada grupo hoy y quienes nombran los sitios de cada
              conferencia) y {number.format(speakers.length)} más que dieron charlas. Elegí a alguien y mirá todo lo que
              hizo.
            </>
          }
          eyebrow="Historia · Personas"
          title="Quienes hacen la comunidad"
        />
        <Container className="pb-16">
          <h2 className="mb-4 text-sm font-medium text-zinc-400" id="organizan">
            Organizan
          </h2>
          <ul
            aria-labelledby="organizan"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {organizers.map((person, i) => {
              const role = person.roles?.[0];
              const where = community.get(person.communities[0] ?? role?.community ?? "")?.name;
              return (
                <li key={person.slug}>
                  <Link
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    href={personHref(person.slug)}
                  >
                    <Avatar eager={i < 12} name={person.name} photo={person.photo} size={44} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-zinc-100">{person.name}</span>
                      <span className="block truncate text-[13px] text-zinc-400">
                        {person.events
                          ? `${count(person.events, "evento", "eventos")}${person.talks ? ` · ${count(person.talks, "charla", "charlas")}` : ""} · ${yearSpan(person.first, person.last)}${where ? ` · ${where}` : ""}`
                          : role && where
                            ? `${ROLE_LABEL[role.role]} ${where}`
                            : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <h2 className="mt-16 mb-4 text-sm font-medium text-zinc-400" id="charlas">
            Dieron charlas
          </h2>
          <ul
            aria-labelledby="charlas"
            className="columns-1 gap-x-8 text-[14px] sm:columns-2 lg:columns-3 xl:columns-4 [&>li]:break-inside-avoid"
          >
            {speakers.map((person) => (
              <li key={person.slug}>
                <Link
                  className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1 text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                  href={personHref(person.slug)}
                >
                  <span className="truncate">{person.name}</span>
                  {person.talks && person.talks > 1 ? (
                    <span className="shrink-0 font-terminal text-[12px] text-zinc-500 tabular-nums">
                      {person.talks}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </main>
      <Footer />
    </>
  );
}
