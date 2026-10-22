import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "app/lib/auth-helpers";
import { QrCode } from "components/Admin/comms/QrCode";
import { resolveAdminCommunityScope } from "app/admin/(dashboard)/[communitySlug]/scope";
import { caller } from "lib/orpc/server";

import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "QR de la encuesta" };

const siteUrl = () => (process.env.NEXT_PUBLIC_BASE_URL ?? "https://owu.uy").replace(/\/$/, "");

/**
 * The survey's QR, one sheet per room (and one for the general link), to print and stick on
 * each room's door. Outside the admin shell so the sheets print clean.
 */
export default async function SurveyQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  await requireAdmin();

  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, null);
  if (!scope?.selected) notFound();

  const event = scope.selected;
  const [rooms, survey] = await Promise.all([
    caller.rooms.getByOpenSpace({ openSpaceId: event.id }),
    caller.surveys.get({ eventId: event.id }),
  ]);
  const link = `${siteUrl()}/comunidad/${communitySlug}/events/${event.slug}/encuesta`;
  const sheets = [
    { id: "general", title: "¿Qué te pareció?", subtitle: event.name, url: link },
    ...rooms
      .filter((room) => room.isActive)
      .map((room) => ({
        id: room.id,
        title: room.name,
        subtitle: "¿Qué te pareció esta sala?",
        url: `${link}?sala=${room.id}`,
      })),
  ];
  const back = `/admin/${communitySlug}/comunicacion?event=${encodeURIComponent(event.slug)}&tab=encuesta`;

  return (
    <main className="min-h-dvh bg-zinc-200 text-black print:bg-white">
      {/* Each sheet is a whole A4 page with its own margins. */}
      <style>{"@page { size: A4; margin: 0; }"}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-black/10 bg-white/90 px-6 py-3 backdrop-blur print:hidden">
        <Link className="inline-flex min-h-11 items-center text-sm text-zinc-600 hover:text-black" href={back}>
          ← Volver a Comunicación
        </Link>
        <p className="text-sm text-zinc-500">
          {sheets.length} hojas · una por sala y una con el link general
          {survey?.isOpen ? null : " · la encuesta está cerrada: abrila antes de pegarlas"}
        </p>
        <PrintButton />
      </div>
      <div className="mx-auto flex max-w-[210mm] flex-col gap-6 py-8 print:gap-0 print:py-0">
        {sheets.map((sheet) => (
          <section
            key={sheet.id}
            className="flex h-[297mm] break-after-page flex-col items-center justify-between bg-white px-[18mm] py-[22mm] text-center shadow-xl last:break-after-auto print:shadow-none"
          >
            <p className="font-display text-xl font-semibold tracking-tight text-zinc-500">{event.name}</p>
            <div className="flex flex-col items-center">
              <h1 className="font-display text-[64px] leading-none font-extrabold tracking-tight break-words">
                {sheet.title}
              </h1>
              <p className="mt-4 font-display text-2xl font-semibold text-zinc-700">{sheet.subtitle}</p>
              <QrCode
                className="mt-12 h-auto w-full max-w-[340px]"
                size={340}
                title={`QR de la encuesta · ${sheet.title}`}
                value={sheet.url}
              />
              <p className="mt-8 text-lg text-zinc-700">Escaneá con la cámara del celular: son dos minutos.</p>
            </div>
            <p className="max-w-full font-terminal text-xs break-all text-zinc-500">{sheet.url}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
