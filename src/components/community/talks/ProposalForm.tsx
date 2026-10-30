"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { buttonClassName, cardClassName } from "components/community/ui";
import { TOPICS } from "lib/community/topics";
import { orpc } from "lib/orpc/client";
import {
  FORMAT_LABEL,
  LANGUAGE_LABEL,
  LEVEL_LABEL,
  ProposalFieldsSchema,
  TALK_FORMATS,
  TALK_LANGUAGES,
  TALK_LEVELS,
  type ProposalFields,
} from "lib/orpc/talks/schemas";

import { Chip, FieldError, Group, inputClassName, textareaClassName, toggle } from "./fields";

export type ProposalDraft = ProposalFields & { anywhere: boolean };

export const emptyDraft = (speakerName: string): ProposalDraft => ({
  speakerName,
  title: "",
  abstract: "",
  format: "corta",
  level: "inicial",
  topics: [],
  language: "es",
  firstTime: false,
  recordingOk: true,
  communityIds: [],
  notes: "",
  anywhere: true,
});

/** The fields of a proposal; the same form proposes and edits. */
export function ProposalForm({
  communities,
  draft,
  editingId,
  onDraft,
  onDone,
}: {
  communities: { id: string; name: string }[] | undefined;
  draft: ProposalDraft;
  /** Editing this proposal instead of making a new one */
  editingId: string | null;
  onDraft: (draft: ProposalDraft) => void;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const done = (message: string) => () => {
    void queryClient.invalidateQueries({ queryKey: orpc.talks.mine.key() });
    setErrors({});
    onDone(message);
  };
  const propose = useMutation(orpc.talks.propose.mutationOptions({ onSuccess: done("¡Listo! Tu propuesta salió.") }));
  const update = useMutation(orpc.talks.update.mutationOptions({ onSuccess: done("Guardamos los cambios.") }));
  const pending = propose.isPending || update.isPending;
  const failed = propose.error ?? update.error;
  const set = <K extends keyof ProposalDraft>(key: K, value: ProposalDraft[K]) => onDraft({ ...draft, [key]: value });
  const described = (field: string) =>
    errors[field] ? { "aria-invalid": true, "aria-describedby": `talk-${field}-error` } : {};

  return (
    <form
      className={cardClassName(false, "flex flex-col gap-8 p-5 sm:p-8")}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const { anywhere, ...fields } = draft;
        const parsed = ProposalFieldsSchema.safeParse({ ...fields, communityIds: anywhere ? [] : fields.communityIds });
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
          return;
        }
        if (!anywhere && parsed.data.communityIds.length === 0) {
          setErrors({ communityIds: "Elegí al menos una comunidad, o «cualquiera de OWU»" });
          return;
        }
        if (editingId) update.mutate({ ...parsed.data, proposalId: editingId });
        else propose.mutate(parsed.data);
      }}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-200" htmlFor="talk-title">
          Título
        </label>
        <input
          className={inputClassName}
          id="talk-title"
          maxLength={120}
          placeholder="Lo que aprendí migrando a Postgres"
          value={draft.title}
          onChange={(event) => set("title", event.target.value)}
          {...described("title")}
        />
        <FieldError id="talk-title-error" message={errors.title} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-200" htmlFor="talk-abstract">
          De qué va
        </label>
        <textarea
          className={textareaClassName}
          id="talk-abstract"
          maxLength={2000}
          placeholder="El problema, qué probaste y qué se lleva quien la escuche. Tres líneas alcanzan."
          value={draft.abstract}
          onChange={(event) => set("abstract", event.target.value)}
          {...described("abstract")}
        />
        <FieldError id="talk-abstract-error" message={errors.abstract} />
      </div>

      <Group legend="Formato">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TALK_FORMATS.map((format) => (
            <Chip
              key={format}
              checked={draft.format === format}
              name="talk-format"
              type="radio"
              onChange={() => set("format", format)}
            >
              {FORMAT_LABEL[format]}
            </Chip>
          ))}
        </div>
      </Group>

      <Group legend="Nivel">
        <div className="flex flex-wrap gap-2">
          {TALK_LEVELS.map((level) => (
            <Chip
              key={level}
              checked={draft.level === level}
              name="talk-level"
              type="radio"
              onChange={() => set("level", level)}
            >
              {LEVEL_LABEL[level]}
            </Chip>
          ))}
        </div>
      </Group>

      <Group hint="Hasta 3." legend="Temas">
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <Chip
              key={topic.value}
              checked={draft.topics.includes(topic.value)}
              disabled={draft.topics.length >= 3}
              onChange={() => set("topics", toggle(draft.topics, topic.value))}
            >
              {topic.label}
            </Chip>
          ))}
        </div>
        <FieldError id="talk-topics-error" message={errors.topics} />
      </Group>

      <Group legend="Idioma">
        <div className="flex flex-wrap gap-2">
          {TALK_LANGUAGES.map((language) => (
            <Chip
              key={language}
              checked={draft.language === language}
              name="talk-language"
              type="radio"
              onChange={() => set("language", language)}
            >
              {LANGUAGE_LABEL[language]}
            </Chip>
          ))}
        </div>
      </Group>

      <Group
        hint="Si elegís comunidades, les avisamos por mail. «Cualquiera de OWU» queda a la vista de todas."
        legend="¿Para qué comunidades?"
      >
        <div className="flex flex-wrap gap-2">
          <Chip checked={draft.anywhere} name="talk-where" type="radio" onChange={() => set("anywhere", true)}>
            Cualquiera de OWU
          </Chip>
          <Chip checked={!draft.anywhere} name="talk-where" type="radio" onChange={() => set("anywhere", false)}>
            Elegir comunidades
          </Chip>
        </div>
        {draft.anywhere ? null : communities ? (
          <div aria-label="Comunidades" className="flex flex-wrap gap-2" role="group">
            {communities.map((community) => (
              <Chip
                key={community.id}
                checked={draft.communityIds.includes(community.id)}
                disabled={draft.communityIds.length >= 8}
                onChange={() => set("communityIds", toggle(draft.communityIds, community.id))}
              >
                {community.name}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Cargando las comunidades…</p>
        )}
        <FieldError id="talk-communityIds-error" message={errors.communityIds} />
      </Group>

      <Group legend="Sobre vos">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-zinc-300" htmlFor="talk-speaker">
            Tu nombre, como querés que salga en el evento
          </label>
          <input
            autoComplete="name"
            className={inputClassName}
            id="talk-speaker"
            maxLength={80}
            value={draft.speakerName}
            onChange={(event) => set("speakerName", event.target.value)}
            {...described("speakerName")}
          />
          <FieldError id="talk-speakerName-error" message={errors.speakerName} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Chip checked={draft.firstTime} onChange={() => set("firstTime", !draft.firstTime)}>
            Es mi primera charla
          </Chip>
          <Chip checked={draft.recordingOk} onChange={() => set("recordingOk", !draft.recordingOk)}>
            Se puede grabar
          </Chip>
        </div>
        {draft.firstTime ? (
          <p className="text-sm text-zinc-400">
            ¡Buenísimo! Quienes organizan lo ven y te pueden ofrecer un ensayo antes.
          </p>
        ) : null}
      </Group>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-200" htmlFor="talk-notes">
          Para quienes organizan (opcional)
        </label>
        <textarea
          className={textareaClassName}
          id="talk-notes"
          maxLength={1000}
          placeholder="Fechas que te sirven, si necesitás algo para la demo…"
          value={draft.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
        <p className="text-sm leading-relaxed text-zinc-400">
          Las comunidades que la tomen ven tu email para coordinar con vos. Nadie más lo ve.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className={buttonClassName("primary", "lg")} disabled={pending} type="submit">
            {pending ? "Enviando…" : editingId ? "Guardar los cambios" : "Enviar propuesta"}
          </button>
          {editingId ? (
            <button className={buttonClassName("ghost", "lg")} type="button" onClick={() => onDone("")}>
              Volver
            </button>
          ) : null}
        </div>
        {Object.keys(errors).length > 0 ? (
          <p className="text-sm text-red-300" role="alert">
            Revisá los campos marcados.
          </p>
        ) : null}
        {failed ? (
          <p className="text-sm text-red-300" role="alert">
            {failed.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
