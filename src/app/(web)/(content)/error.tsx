"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { buttonClassName, ButtonLink, Container, TitleBar } from "components/community/ui";

/** A page of the community site failed to render; the navbar and the rest of the site stay up */
export default function ContentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section className="relative isolate overflow-hidden">
      <Container className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center py-24 text-center">
        <h1 className="font-title text-4xl font-extrabold tracking-[-0.025em] text-white sm:text-5xl">
          Algo se rompió
        </h1>
        <TitleBar className="mt-6" />
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-zinc-400 sm:text-base">
          Ya nos llegó el aviso. Probá de nuevo; si sigue fallando, contanos en el Slack de OWU.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button className={buttonClassName("primary", "lg")} type="button" onClick={reset}>
            Reintentar
          </button>
          <ButtonLink href="/" size="lg" variant="secondary">
            Ir al inicio
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
