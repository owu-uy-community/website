"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Check, Hourglass, MapPin } from "lucide-react";

import { QrCode } from "components/Admin/comms/QrCode";
import { useNow } from "components/Admin/ui/time";
import { buttonClassName, cardClassName } from "components/community/ui";
import { shortWhen } from "lib/community/time";
import { canConfirm } from "lib/organizar/rsvp-state";
import { orpc } from "lib/orpc/client";
import type { Ticket } from "lib/orpc/rsvps/schemas";

const STATUS: Record<string, string> = {
  attending: "Tenés lugar",
  offered: "Hay un lugar para vos",
  waitlisted: "En lista de espera",
  pending: "Esperando aprobación",
  cancelled: "Liberaste tu lugar",
  declined: "No confirmada",
};

const ACTIVE = ["attending", "offered", "waitlisted", "pending"];

/** "Hay 23 personas en lista de espera": what freeing a seat is worth, or nothing */
const waitingLine = (waiting: number) =>
  waiting
    ? `Hay ${waiting === 1 ? "1 persona" : `${waiting} personas`} en lista de espera: si no podés, tu lugar pasa a la siguiente.`
    : "Si no podés, liberalo: así sabemos cuántos somos.";

/**
 * The ticket itself: QR and code for the door, where and when, and the actions that matter. From
 * the reminder's links (`action`), it asks one thing with one button, which POSTs: opening the
 * link never changes anything by itself.
 */
export function TicketView({ ticket, action }: { ticket: Ticket; action?: "confirmar" | "liberar" }) {
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow(60_000);
  const { rsvp, event } = ticket;
  // Done: drop ?accion= so a reload doesn't ask again, and read the ticket fresh
  const done = {
    onSuccess: () => router.replace(`${pathname}?t=${encodeURIComponent(ticket.token)}`),
  };
  const leave = useMutation(orpc.rsvps.leaveByToken.mutationOptions(done));
  const confirmOffer = useMutation(orpc.rsvps.confirmByToken.mutationOptions(done));
  const attend = useMutation(orpc.rsvps.confirmByLink.mutationOptions(done));
  const error = leave.error ?? confirmOffer.error ?? attend.error;
  const cancelled = event.status === "cancelled";
  const active = !cancelled && ACTIVE.includes(rsvp.status) && !rsvp.checkedInAt;
  const asksVoy = !cancelled && canConfirm(event, rsvp, now);
  const voy = (
    <button
      className={buttonClassName("primary", "lg", "w-full")}
      disabled={attend.isPending}
      type="button"
      onClick={() => attend.mutate({ token: ticket.token, eventId: event.id })}
    >
      {attend.isPending ? "Confirmando…" : "Voy ✅"}
    </button>
  );
  const release = (primary: boolean) => (
    <button
      className={
        primary
          ? buttonClassName("secondary", "lg", "w-full")
          : "text-[14px] text-zinc-400 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
      }
      disabled={leave.isPending}
      type="button"
      onClick={() => leave.mutate({ token: ticket.token, eventId: event.id })}
    >
      {leave.isPending ? "Liberando…" : primary ? "Liberar mi lugar" : "No puedo ir: liberar mi lugar"}
    </button>
  );

  // One question from the reminder: one answer, nothing else to press
  if (action === "confirmar" && rsvp.status === "attending" && !cancelled) {
    return (
      <div className={cardClassName(false, "flex flex-col items-center gap-4 p-6 text-center")}>
        <p className="text-[13px] font-medium tracking-[0.12em] text-zinc-500 uppercase">{event.community.name}</p>
        <h1 className="font-title text-2xl leading-tight font-bold text-white">{event.name}</h1>
        <p className="text-[15px] text-zinc-300">{shortWhen(event.startDate)}</p>
        {rsvp.confirmedAt ? (
          <p className="flex items-center gap-2 text-[15px] text-zinc-100">
            <Check aria-hidden className="size-5 text-yellow-400" />
            Ya confirmaste: te esperamos.
          </p>
        ) : asksVoy || now === 0 ? (
          <>
            <p className="text-[15px] text-zinc-300">¿Seguís viniendo? Confirmalo con un toque.</p>
            {voy}
          </>
        ) : (
          <p className="text-[15px] text-zinc-300">Ya no hace falta confirmar.</p>
        )}
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error.message}
          </p>
        ) : null}
        <Link className="text-[14px] text-zinc-500 hover:text-zinc-300" href={`${pathname}?t=${ticket.token}`}>
          Ver mi entrada
        </Link>
      </div>
    );
  }
  if (action === "liberar" && active) {
    return (
      <div className={cardClassName(false, "flex flex-col items-center gap-4 p-6 text-center")}>
        <p className="text-[13px] font-medium tracking-[0.12em] text-zinc-500 uppercase">{event.community.name}</p>
        <h1 className="font-title text-2xl leading-tight font-bold text-white">{event.name}</h1>
        <p className="text-[15px] text-zinc-300">{shortWhen(event.startDate)}</p>
        <p className="text-[15px] text-zinc-300">{waitingLine(event.waiting)}</p>
        {release(true)}
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error.message}
          </p>
        ) : null}
        <Link className="text-[14px] text-zinc-500 hover:text-zinc-300" href={`${pathname}?t=${ticket.token}`}>
          Mejor no: ver mi entrada
        </Link>
      </div>
    );
  }

  return (
    <div className={cardClassName(false, "flex flex-col items-center gap-5 p-6 text-center")}>
      <p className="text-[13px] font-medium tracking-[0.12em] text-zinc-500 uppercase">{event.community.name}</p>
      <h1 className="font-title text-2xl leading-tight font-bold text-white">{event.name}</h1>
      {cancelled ? (
        <p className="text-red-300">El evento se canceló.</p>
      ) : rsvp.status === "attending" && rsvp.code ? (
        <>
          <div className="rounded-2xl bg-white p-3">
            <QrCode size={220} title={`Entrada ${rsvp.code}`} value={rsvp.code} />
          </div>
          <p className="font-mono text-xl tracking-[0.3em] text-white">{rsvp.code}</p>
          <p className="flex items-center gap-1.5 text-[15px] text-zinc-200">
            <Check aria-hidden className="size-4 text-yellow-400" />
            {ticket.name}
            {rsvp.guests ? ` + ${rsvp.guests}` : ""}
            {rsvp.checkedInAt ? " · ya entraste" : rsvp.confirmedAt ? " · confirmaste" : ""}
          </p>
        </>
      ) : (
        <p className="flex items-center gap-2 text-[15px] text-zinc-200">
          <Hourglass aria-hidden className="size-4 text-yellow-400" />
          {STATUS[rsvp.status]}
          {rsvp.status === "waitlisted" && rsvp.position ? `, puesto ${rsvp.position}` : ""}
        </p>
      )}
      <ul className="flex w-full flex-col gap-2 text-left text-[15px] text-zinc-300">
        <li className="flex items-start gap-2.5">
          <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          {shortWhen(event.startDate)}
        </li>
        <li className="flex items-start gap-2.5">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          {rsvp.address ?? event.place}
        </li>
      </ul>
      {rsvp.onlineUrl ? (
        <a
          className="text-[14px] break-all text-yellow-400 underline underline-offset-4"
          href={rsvp.onlineUrl}
          rel="noreferrer"
          target="_blank"
        >
          {rsvp.onlineUrl}
        </a>
      ) : null}
      {asksVoy ? voy : null}
      {!cancelled && rsvp.status === "offered" ? (
        <button
          className={buttonClassName("primary", "lg", "w-full")}
          disabled={confirmOffer.isPending}
          type="button"
          onClick={() => confirmOffer.mutate({ token: ticket.token })}
        >
          Confirmar mi lugar{rsvp.offerExpiresAt ? ` (hasta el ${shortWhen(rsvp.offerExpiresAt)})` : ""}
        </button>
      ) : null}
      {active ? release(false) : null}
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error.message}
        </p>
      ) : null}
      <Link
        className="text-[14px] text-zinc-500 hover:text-zinc-300"
        href={`/comunidad/${event.community.slug}/events/${event.slug}`}
      >
        Ver el evento
      </Link>
    </div>
  );
}
