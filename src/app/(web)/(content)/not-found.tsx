import { ButtonLink, Container, Kbd, TitleBar } from "components/community/ui";
import Footer from "components/shared/Footer";

/** Shown when a page in the community site doesn't exist, or a draft asks for `notFound()` */
export default function NotFound() {
  return (
    <>
      <section className="relative isolate overflow-hidden">
        <Container className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center py-24 text-center">
          <p className="font-title text-[7rem] leading-none font-extrabold tracking-[-0.05em] text-white sm:text-[10rem]">
            404
          </p>
          <TitleBar className="mt-6" />
          <h1 className="mt-6 font-title text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            Esta página no está, o todavía no existe
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-zinc-400 sm:text-base">
            Capaz el link cambió, capaz es un typo. Lo que sí está: la agenda, las comunidades y las charlas.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink arrow href="/" size="lg">
              Ir al inicio
            </ButtonLink>
            <ButtonLink href="/eventos" size="lg" variant="secondary">
              Ver la agenda
            </ButtonLink>
          </div>
          <p className="mt-8 flex items-center gap-2 text-sm text-zinc-500">
            O buscá lo que querías con <Kbd>⌘K</Kbd>
          </p>
        </Container>
      </section>
      <Footer />
    </>
  );
}
