"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { buttonClassName } from "components/community/ui";
import { CONDUCT_EMAIL } from "lib/community/site";
import { orpc } from "lib/orpc/client";

const field =
  "block w-full rounded-xl border border-white/15 bg-black/20 px-3.5 py-3 text-base text-white placeholder:text-zinc-500 focus:border-yellow-400/70 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none";

/** The report itself: what happened, optionally where and how to reach them, and whether it names the team. */
export function ReportForm({ communitySlug, eventSlug }: { communitySlug: string; eventSlug: string }) {
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState("");
  const [contact, setContact] = useState("");
  const [involvesOrganizer, setInvolvesOrganizer] = useState(false);
  const [short, setShort] = useState(false);
  const report = useMutation(orpc.conduct.report.mutationOptions());

  if (report.isSuccess) {
    return (
      <section aria-live="polite" className="mt-8 rounded-2xl border border-yellow-400/30 bg-yellow-400/[0.06] p-6">
        <h2 className="text-xl font-bold text-white">Recibimos tu reporte. Gracias por avisar.</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-300">
          {report.data.to === "owu"
            ? "Lo recibe solo el equipo de conducta de OWU."
            : "Lo reciben quienes responden por la conducta del evento y el equipo de conducta de OWU."}
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-300">
          {contact.trim() ? (
            "Te escriben en medio día si el evento está en curso, o en 7 días si ya pasó."
          ) : (
            <>
              Como no dejaste contacto, no podemos contarte qué hicimos. Si querés seguirlo, escribí a{" "}
              <a className="text-yellow-400 underline underline-offset-4" href={`mailto:${CONDUCT_EMAIL}`}>
                {CONDUCT_EMAIL}
              </a>
              .
            </>
          )}
        </p>
      </section>
    );
  }

  const error = short
    ? "Contanos un poco más: con 10 letras alcanza."
    : report.error && "code" in report.error && report.error.code === "TOO_MANY_REQUESTS"
      ? `Mandaste varios reportes seguidos: esperá un rato o escribí a ${CONDUCT_EMAIL}.`
      : report.error?.message;

  return (
    <form
      className="mt-8 space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (description.trim().length < 10) return setShort(true);
        report.mutate({ communitySlug, eventSlug, description, where, contact, involvesOrganizer });
      }}
    >
      <div className="space-y-2">
        <label className="block text-[15px] font-semibold text-white" htmlFor="report-description">
          ¿Qué pasó?
        </label>
        <p className="text-[14px] text-zinc-400" id="report-description-hint">
          Contá lo que te parezca: qué pasó y, si querés, con quién. Con unas líneas alcanza.
        </p>
        <textarea
          aria-describedby="report-description-hint"
          className={`${field} min-h-36`}
          id="report-description"
          maxLength={4000}
          required
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setShort(false);
          }}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-[15px] font-semibold text-white" htmlFor="report-where">
          ¿Dónde o cuándo? <span className="font-normal text-zinc-400">(opcional)</span>
        </label>
        <input
          className={field}
          id="report-where"
          maxLength={200}
          placeholder="En el break, en la fila de la pizza, en el Slack…"
          value={where}
          onChange={(event) => setWhere(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-[15px] font-semibold text-white" htmlFor="report-contact">
          ¿Cómo te contactamos? <span className="font-normal text-zinc-400">(opcional)</span>
        </label>
        <p className="text-[14px] text-zinc-400" id="report-contact-hint">
          Email o teléfono. Si lo dejás vacío, el reporte es anónimo.
        </p>
        <input
          aria-describedby="report-contact-hint"
          autoComplete="email"
          className={field}
          id="report-contact"
          maxLength={200}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
        />
      </div>
      <label
        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
        htmlFor="report-organizer"
      >
        <input
          checked={involvesOrganizer}
          className="mt-1 size-5 shrink-0 accent-yellow-400"
          id="report-organizer"
          type="checkbox"
          onChange={(event) => setInvolvesOrganizer(event.target.checked)}
        />
        <span className="text-[15px] leading-relaxed text-zinc-300">
          <span className="block font-semibold text-white">Involucra a alguien de la organización</span>
          Va solo al equipo de conducta de OWU: nadie del equipo de la comunidad lo recibe ni lo puede leer.
        </span>
      </label>
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <button className={buttonClassName("accent", "lg", "w-full")} disabled={report.isPending} type="submit">
        {report.isPending ? "Mandando…" : "Mandar el reporte"}
      </button>
    </form>
  );
}
