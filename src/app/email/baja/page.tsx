import type { Metadata } from "next";

import { buttonClassName, cardClassName } from "components/community/ui";
import { readUnsubscribe, type UnsubscribeScope } from "lib/links";

export const metadata: Metadata = {
  title: "Dejar de recibir emails · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const COPY: Record<UnsubscribeScope, { ask: string; what: string; done: string }> = {
  reminders: {
    ask: "¿Sin recordatorios?",
    what: "Dejás de recibir los recordatorios antes de cada evento y los pedidos de opinión después. Las confirmaciones y los avisos de cambios te siguen llegando.",
    done: "No te mandamos más recordatorios ni pedidos de opinión. Las confirmaciones y los avisos de cambios te siguen llegando.",
  },
  followers: {
    ask: "¿Sin avisos de eventos nuevos?",
    what: "Dejás de recibir un email cada vez que una comunidad que seguís publica un evento. Para dejar de seguir solo a una, entrá a su perfil.",
    done: "No te avisamos más de los eventos nuevos de las comunidades que seguís. Los emails de los eventos a los que te anotás te siguen llegando.",
  },
};

/** The emails' "Dejá de recibirlos": a confirm button, so a link opened by a scanner changes nothing. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; listo?: string }>;
}) {
  const { t, listo } = await searchParams;
  const link = t ? await readUnsubscribe(t) : null;
  const done = listo ? COPY[listo === "followers" ? "followers" : "reminders"] : null;

  return (
    <main className="owu-site flex min-h-screen items-center justify-center bg-[#0c0c0f] px-5">
      <div className={cardClassName(false, "flex max-w-md flex-col gap-5 p-7 text-center")}>
        {done ? (
          <>
            <h1 className="font-title text-2xl font-bold text-white">Listo</h1>
            <p className="text-[15px] leading-relaxed text-zinc-300">{done.done}</p>
          </>
        ) : link && t ? (
          <form action="/api/email/unsubscribe?form=1" className="flex flex-col gap-5" method="post">
            <input name="t" type="hidden" value={t} />
            <h1 className="font-title text-2xl font-bold text-white">{COPY[link.scope].ask}</h1>
            <p className="text-[15px] leading-relaxed text-zinc-300">{COPY[link.scope].what}</p>
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
