import { headers } from "next/headers";
import { Check, Gift, Presentation } from "lucide-react";

import { auth } from "app/lib/auth";
import { ButtonLink, cardClassName, Container, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";

import { OfferVenueForm } from "./OfferVenueForm";

export const metadata = pageMetadata({
  title: "Sumá tu espacio",
  description:
    "Prestá tu oficina o sala para que una comunidad tech de Uruguay haga su meetup. Elegís qué días y cada cuánto; las comunidades te piden fecha y respondés desde un link.",
  path: "/empresas/espacio",
});

// The form knows who is signed in: rendered per request, allowed to block (Cache Components)
export const instant = false;

/** What hosting takes: what a usual meetup needs from the space. */
const NEEDS = [
  "Una sala para 20 a 100 personas sentadas, unas dos o tres horas de 18:30 en adelante",
  "Un proyector o una pantalla, con su cable",
  "Wi-Fi para quienes presentan",
  "Agua. La comida es opcional: muchas comunidades la consiguen aparte",
];

/** What a host gets: only what OWU and the panel actually do. */
const GETS = [
  "El nombre y el logo de la empresa en la página del evento en owu.uy",
  "Un par de minutos al principio para presentar la empresa, si quieren",
  "Después, un resumen con cuántas personas vinieron, cuántas por primera vez y qué les pareció",
  "Las fotos y los materiales, cuando la comunidad los comparte",
  "Una semana antes, una hoja con el horario, cuántas personas esperar y qué necesitan",
];

export default async function OfferVenuePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <>
      <PageHeader
        description="Las comunidades buscan lugar todos los meses. Contanos qué tenés y cuándo: cuando una comunidad te pida fecha, te llega un mail y respondés desde un link, sin cuentas ni planillas."
        eyebrow="Para empresas"
        title="Sumá tu espacio"
      />
      <Container className="pb-24">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <section aria-labelledby="recibir" className="grid gap-4 sm:grid-cols-2">
            <h2 className="sr-only" id="recibir">
              Qué es recibir un meetup
            </h2>
            <div className={cardClassName(false, "flex flex-col gap-4 p-6")}>
              <p className="flex items-center gap-2 font-title text-[17px] font-semibold text-white">
                <Presentation aria-hidden className="size-5 text-yellow-400" />
                Qué hace falta
              </p>
              <ul className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-zinc-300">
                {NEEDS.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-zinc-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cardClassName(false, "flex flex-col gap-4 p-6")}>
              <p className="flex items-center gap-2 font-title text-[17px] font-semibold text-white">
                <Gift aria-hidden className="size-5 text-yellow-400" />
                Qué reciben
              </p>
              <ul className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-zinc-300">
                {GETS.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-yellow-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {session ? (
            <OfferVenueForm name={session.user.name} />
          ) : (
            <div
              className={cardClassName(
                false,
                "flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
              )}
            >
              <p className="max-w-xl text-[15px] leading-relaxed text-zinc-300">
                Entrá primero: con tu email (te mandamos un código) o con el Slack de OWU. Así los pedidos te llegan a
                vos y nadie ofrece tu espacio en tu nombre.
              </p>
              <ButtonLink arrow href="/login?next=/empresas/espacio">
                Entrar
              </ButtonLink>
            </div>
          )}
        </div>
      </Container>
      <Footer />
    </>
  );
}
