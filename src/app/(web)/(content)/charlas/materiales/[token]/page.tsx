import type { Metadata } from "next";

import { cardClassName, PageHeader, Section } from "components/community/ui";
import Footer from "components/shared/Footer";
import { shortWhen } from "lib/community/time";
import { publicCaller } from "lib/orpc/server";

import { MaterialsForm } from "./MaterialsForm";

// The token is the only key: never cached, never indexed, never sent on as a referrer (Cache Components)
export const instant = false;
export const metadata: Metadata = {
  title: "Tus slides y la grabación · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * From the thanks email: the speaker pastes links to their slides or recording, once. Opening the
 * page changes nothing; the form posts.
 */
export default async function MaterialsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await publicCaller.talks.materials.view({ token }).catch(() => null);

  return (
    <>
      <PageHeader
        description={
          view
            ? `${view.event.name}, ${shortWhen(view.event.startDate)}. Salen en la página del evento, para quien no pudo ir.`
            : undefined
        }
        eyebrow="Tu charla"
        title={view ? view.title : "Este link ya no sirve"}
      />
      <Section>
        <div className={cardClassName(false, "max-w-2xl p-6 sm:p-8")}>
          {!view ? (
            <p className="text-zinc-300">
              Venció o está incompleto. Mandale los links a quien organiza: tiene tu charla en su panel.
            </p>
          ) : view.sent ? (
            <p className="text-zinc-300">
              Ya los mandaste, ¡gracias! Si falta algo, escribile a quien organiza.
              {view.event.url ? (
                <>
                  {" "}
                  <a className="text-white underline underline-offset-4" href={view.event.url}>
                    Ver el evento
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <MaterialsForm eventUrl={view.event.url} token={token} />
          )}
        </div>
      </Section>
      <Footer />
    </>
  );
}
