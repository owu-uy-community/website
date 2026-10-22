import type { Metadata } from "next";

import { buttonClassName, cardClassName } from "components/community/ui";

export const metadata: Metadata = {
  title: "Recordatorios · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The emails' "Dejá de recibirlos": a confirm button, so a link opened by a scanner changes nothing. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; listo?: string }>;
}) {
  const { t, listo } = await searchParams;

  return (
    <main className="owu-site flex min-h-screen items-center justify-center bg-[#0c0c0f] px-5">
      <div className={cardClassName(false, "flex max-w-md flex-col gap-5 p-7 text-center")}>
        {listo ? (
          <>
            <h1 className="font-title text-2xl font-bold text-white">Listo</h1>
            <p className="text-[15px] leading-relaxed text-zinc-300">
              No te mandamos más recordatorios ni pedidos de opinión. Las confirmaciones y los avisos de cambios te
              siguen llegando.
            </p>
          </>
        ) : t ? (
          <form action="/api/email/unsubscribe?form=1" className="flex flex-col gap-5" method="post">
            <input name="t" type="hidden" value={t} />
            <h1 className="font-title text-2xl font-bold text-white">¿Sin recordatorios?</h1>
            <p className="text-[15px] leading-relaxed text-zinc-300">
              Dejás de recibir los recordatorios antes de cada evento y los pedidos de opinión después. Las
              confirmaciones y los avisos de cambios te siguen llegando.
            </p>
            <button className={buttonClassName("primary", "lg", "w-full")} type="submit">
              Dejar de recibirlos
            </button>
          </form>
        ) : (
          <p className="text-zinc-300">Este link no es válido.</p>
        )}
      </div>
    </main>
  );
}
