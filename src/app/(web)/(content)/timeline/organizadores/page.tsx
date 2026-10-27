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
  title: "Quienes organizan la comunidad tech uruguaya",
  description:
    "Las personas y organizaciones detrás de cada meetup, conferencia y hackatón de la comunidad tech de Uruguay, con todo lo que organizó cada una.",
  path: "/timeline/organizadores",
});

const number = new Intl.NumberFormat("es-UY");

export default async function OrganizersPage() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { people, community } = getTimeline();

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
              {number.format(people.length)} personas y organizaciones detrás de los eventos de la historia: quienes los
              anunciaron en Meetup, el equipo de cada grupo hoy y quienes nombran los sitios de cada conferencia. Elegí
              a alguien y mirá todo lo que organizó.
            </>
          }
          eyebrow="Historia · Organizadores"
          title="Quienes organizan"
        />
        <Container className="pb-16">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {people.map((person, i) => {
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
                          ? `${number.format(person.events)} ${person.events === 1 ? "evento" : "eventos"} · ${yearSpan(person.first, person.last)}${where ? ` · ${where}` : ""}`
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
        </Container>
      </main>
      <Footer />
    </>
  );
}
