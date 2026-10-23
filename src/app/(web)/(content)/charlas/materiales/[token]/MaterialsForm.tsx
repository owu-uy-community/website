"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { inputClassName } from "components/community/talks/fields";
import { buttonClassName } from "components/community/ui";
import { orpc } from "lib/orpc/client";
import { SubmitMaterialsSchema } from "lib/orpc/talks/schemas";

/** Slides and recording links, once; they go to the event's page. */
export function MaterialsForm({ token, eventUrl }: { token: string; eventUrl: string | null }) {
  const [slides, setSlides] = useState("");
  const [recording, setRecording] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = useMutation(orpc.talks.materials.submit.mutationOptions());

  if (submit.isSuccess) {
    return (
      <p className="text-zinc-200" role="status">
        ¡Listo, gracias! Ya están en la página del evento.{" "}
        {eventUrl ? (
          <a className="text-white underline underline-offset-4" href={eventUrl}>
            Ver el evento
          </a>
        ) : null}
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = SubmitMaterialsSchema.safeParse({
          token,
          slides: slides.trim() || undefined,
          recording: recording.trim() || undefined,
        });
        if (!parsed.success) {
          setProblem(parsed.error.issues[0]?.message ?? "Revisá los links");
          return;
        }
        setProblem(null);
        submit.mutate(parsed.data);
      }}
    >
      <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="materials-slides">
        Link a las slides
        <input
          className={inputClassName}
          id="materials-slides"
          inputMode="url"
          placeholder="https://…"
          type="url"
          value={slides}
          onChange={(event) => setSlides(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="materials-recording">
        Link a la grabación (opcional)
        <input
          className={inputClassName}
          id="materials-recording"
          inputMode="url"
          placeholder="https://youtube.com/…"
          type="url"
          value={recording}
          onChange={(event) => setRecording(event.target.value)}
        />
      </label>
      <p className="text-sm text-zinc-400">El link de este mail sirve una vez: pegá los dos si tenés los dos.</p>
      <button className={buttonClassName("primary", "lg", "self-start")} disabled={submit.isPending} type="submit">
        {submit.isPending ? "Mandando…" : "Mandar"}
      </button>
      {problem || submit.isError ? (
        <p className="text-sm text-red-300" role="alert">
          {problem ?? submit.error?.message}
        </p>
      ) : null}
    </form>
  );
}
