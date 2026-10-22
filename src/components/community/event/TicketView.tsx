"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Check, Hourglass, MapPin } from "lucide-react";

import { QrCode } from "components/Admin/comms/QrCode";
import { buttonClassName, cardClassName } from "components/community/ui";
import { shortWhen } from "lib/community/time";
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

/** The ticket itself: QR and code for the door, where and when, and the actions that matter. */
export function TicketView({ ticket }: { ticket: Ticket }) {
  const router = useRouter();
  const { rsvp, event } = ticket;
  const done = { onSuccess: () => router.refresh() };
  const leave = useMutation(orpc.rsvps.leaveByToken.mutationOptions(done));
  const confirm = useMutation(orpc.rsvps.confirmByToken.mutationOptions(done));
  const error = leave.error ?? confirm.error;
  const cancelled = event.status === "cancelled";

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
            {rsvp.checkedInAt ? " · ya entraste" : ""}
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
      {!cancelled && rsvp.status === "offered" ? (
        <button
          className={buttonClassName("primary", "lg", "w-full")}
          disabled={confirm.isPending}
          type="button"
          onClick={() => confirm.mutate({ token: ticket.token })}
        >
          Confirmar mi lugar{rsvp.offerExpiresAt ? ` (hasta el ${shortWhen(rsvp.offerExpiresAt)})` : ""}
        </button>
      ) : null}
      {!cancelled && ["attending", "offered", "waitlisted", "pending"].includes(rsvp.status) && !rsvp.checkedInAt ? (
        <button
          className="text-[14px] text-zinc-400 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
          disabled={leave.isPending}
          type="button"
          onClick={() => leave.mutate({ token: ticket.token })}
        >
          No puedo ir: liberar mi lugar
        </button>
      ) : null}
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
