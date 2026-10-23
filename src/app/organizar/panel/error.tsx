"use client";

import { useEffect } from "react";

import { PageContainer } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { loadSentry } from "lib/errors/client";

/** A panel page failed to load (the database, the network): the shell stays, with a way to retry. */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void loadSentry().then((Sentry) => Sentry?.captureException(error));
  }, [error]);

  return (
    <PageContainer>
      <ErrorState
        description="Fue un problema nuestro o de la conexión, no algo que hiciste. Probá de nuevo en un rato."
        title="No pudimos cargar esta página"
        onRetry={reset}
      />
    </PageContainer>
  );
}
