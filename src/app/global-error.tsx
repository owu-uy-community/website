"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "./globals.css";

/** Last-resort boundary: the root layout itself failed, so it renders its own document. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <h1 className="text-2xl font-bold">Algo se rompió</h1>
        <p className="max-w-md text-zinc-400">
          Ya nos llegó el aviso. Probá de nuevo; si sigue fallando, avisanos en el Slack de OWU.
        </p>
        <button className="rounded-md bg-yellow-400 px-4 py-2 font-semibold text-black" type="button" onClick={reset}>
          Reintentar
        </button>
      </body>
    </html>
  );
}
