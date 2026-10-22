import { headers } from "next/headers";

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
        <div className="mx-auto max-w-3xl">
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
