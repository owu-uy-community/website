import { cacheLife } from "next/cache";
import Link from "next/link";

import { ButtonLink, Container, headingClassName, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getTimeline } from "lib/timeline/data";
import { getGraph } from "lib/timeline/graph";

import Avatar from "../Avatar";
import { personHref } from "../Organizers";
import Provenance from "../Provenance";
import NetworkGate from "./NetworkGate";

export const metadata = pageMetadata({
  title: "Cómo se conecta la comunidad tech uruguaya",
  description:
    "Las comunidades tech de Uruguay, las personas que las organizaron o dieron charlas en ellas y los lugares donde se juntaron, en una red: quién une a quién.",
  path: "/timeline/red",
});

const number = new Intl.NumberFormat("es-UY");

export default async function NetworkPage() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { nodes, edges } = getGraph();
  const { person } = getTimeline();
  const count = (kind: string) => nodes.filter((node) => node.t === kind).length;

  // Who ties the most communities together: the people the network's bridges run through
  const communities = new Map<number, number>();
  for (const [a, b] of edges)
    for (const [one, other] of [
      [a, b],
      [b, a],
    ])
      if (nodes[one].t === "p" && nodes[other].t === "c") communities.set(one, (communities.get(one) ?? 0) + 1);
  const bridges = [...communities]
    .filter(([, n]) => n > 2)
    .toSorted((x, y) => y[1] - x[1] || nodes[y[0]].n - nodes[x[0]].n)
    .slice(0, 24)
    .map(([i, n]) => ({ person: person.get(nodes[i].k.slice(2))!, communities: n, events: nodes[i].n }));

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
              {number.format(count("c"))} comunidades, {number.format(count("p"))} personas y{" "}
              {number.format(count("v"))} lugares: cada persona, unida a las comunidades donde organizó o dio una
              charla, y cada lugar, a las que se juntaron ahí. Las que comparten gente quedan cerca.
            </>
          }
          eyebrow="Historia · Red"
          title="Cómo se conecta todo"
        />

        <Container>
          <NetworkGate />
        </Container>

        <Container className="py-12 sm:py-16">
          <section aria-labelledby="puentes">
            <h2 className={headingClassName.h3} id="puentes">
              Quiénes unen comunidades
            </h2>
            <p className="mt-2 max-w-2xl text-zinc-400">
              Las personas y organizaciones que organizaron o dieron charlas en más comunidades distintas: por ellas
              pasan los puentes de la red.
            </p>
            <ol className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bridges.map(({ person: bridge, communities: n, events }) => (
                <li key={bridge.slug}>
                  <Link
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    href={personHref(bridge.slug)}
                  >
                    <Avatar name={bridge.name} photo={bridge.photo} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-zinc-100">{bridge.name}</span>
                      <span className="block text-[13px] text-zinc-400">
                        {n} comunidades · {number.format(events)} {events === 1 ? "evento" : "eventos"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <Provenance className="mt-16" path="/timeline/red" subject="Sacar algo de la red de la historia">
            La red sale de los mismos datos que el resto de la historia: quién figura como anfitrión de cada evento en
            Meetup, quién dio cada charla según los anuncios y programas, y dónde se hizo cada evento. Mapa de la red
            dibujado con{" "}
            <a
              className="underline underline-offset-2 hover:text-zinc-300"
              href="https://www.sigmajs.org"
              rel="noopener noreferrer"
              target="_blank"
            >
              sigma.js
            </a>{" "}
            y{" "}
            <a
              className="underline underline-offset-2 hover:text-zinc-300"
              href="https://graphology.github.io"
              rel="noopener noreferrer"
              target="_blank"
            >
              graphology
            </a>
            .
          </Provenance>
        </Container>
      </main>
      <Footer />
    </>
  );
}
