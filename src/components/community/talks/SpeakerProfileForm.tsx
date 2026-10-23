"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { buttonClassName, cardClassName } from "components/community/ui";
import { TOPICS } from "lib/community/topics";
import { orpc } from "lib/orpc/client";
import {
  FORMAT_LABEL,
  LANGUAGE_LABEL,
  SpeakerProfileSchema,
  TALK_FORMATS,
  TALK_LANGUAGES,
  type SpeakerProfile,
} from "lib/orpc/talks/schemas";

import { Chip, Group, inputClassName, textareaClassName, toggle } from "./fields";

const LINKS = [
  { key: "website", label: "Web", placeholder: "https://tusitio.uy" },
  { key: "github", label: "GitHub", placeholder: "https://github.com/tu-usuario" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/tu-usuario" },
] as const;

/** A speaker's profile: what organizers see next to their proposals, and their page if they open it. */
export function SpeakerProfileForm({ userId }: { userId: string }) {
  const saved = useQuery(orpc.talks.profile.queryOptions());

  if (saved.isError) {
    return (
      <div className={cardClassName(false, "flex items-center justify-between gap-4 p-5")} role="alert">
        <p className="text-sm text-red-300">No pudimos cargar tu perfil.</p>
        <button className={buttonClassName("secondary", "sm")} type="button" onClick={() => void saved.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!saved.data) return <div className={cardClassName(false, "h-40 animate-pulse")} />;

  return <ProfileFields initial={saved.data} userId={userId} />;
}

function ProfileFields({ initial, userId }: { initial: SpeakerProfile; userId: string }) {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState(initial);
  const [links, setLinks] = useState<Record<string, string>>({ ...initial.links });
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation(
    orpc.talks.saveProfile.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(orpc.talks.profile.queryKey(), data),
    })
  );
  const set = <K extends keyof SpeakerProfile>(key: K, value: SpeakerProfile[K]) =>
    setProfile((current) => ({ ...current, [key]: value }));

  return (
    <form
      className={cardClassName(false, "flex flex-col gap-6 p-5 sm:p-7")}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = SpeakerProfileSchema.safeParse({
          ...profile,
          links: Object.fromEntries(Object.entries(links).filter(([, url]) => url.trim())),
        });
        if (!parsed.success) {
          setProblem(parsed.error.issues[0]?.message ?? "Revisá los campos");
          return;
        }
        setProblem(null);
        save.mutate(parsed.data);
      }}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-200" htmlFor="speaker-bio">
          Quién sos, en dos líneas
        </label>
        <textarea
          className={textareaClassName}
          id="speaker-bio"
          maxLength={600}
          placeholder="Backend en una fintech, me gusta romper cosas en producción (y arreglarlas)."
          value={profile.bio}
          onChange={(event) => set("bio", event.target.value)}
        />
      </div>

      <Group hint="Hasta 5." legend="De qué hablás">
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <Chip
              key={topic.value}
              checked={profile.topics.includes(topic.value)}
              disabled={profile.topics.length >= 5}
              onChange={() => set("topics", toggle(profile.topics, topic.value))}
            >
              {topic.label}
            </Chip>
          ))}
        </div>
      </Group>

      <div className="grid gap-6 sm:grid-cols-2">
        <Group legend="Idiomas">
          <div className="flex flex-wrap gap-2">
            {TALK_LANGUAGES.map((language) => (
              <Chip
                key={language}
                checked={profile.languages.includes(language)}
                onChange={() => set("languages", toggle(profile.languages, language))}
              >
                {LANGUAGE_LABEL[language]}
              </Chip>
            ))}
          </div>
        </Group>
        <Group legend="Formatos">
          <div className="flex flex-wrap gap-2">
            {TALK_FORMATS.map((format) => (
              <Chip
                key={format}
                checked={profile.formats.includes(format)}
                onChange={() => set("formats", toggle(profile.formats, format))}
              >
                {FORMAT_LABEL[format]}
              </Chip>
            ))}
          </div>
        </Group>
      </div>

      <Group legend="Links">
        <div className="grid gap-3 sm:grid-cols-3">
          {LINKS.map((link) => (
            <label key={link.key} className="flex flex-col gap-1.5 text-sm text-zinc-300">
              {link.label}
              <input
                className={inputClassName}
                inputMode="url"
                placeholder={link.placeholder}
                type="url"
                value={links[link.key] ?? ""}
                onChange={(event) => setLinks({ ...links, [link.key]: event.target.value })}
              />
            </label>
          ))}
        </div>
      </Group>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Chip checked={profile.mentor} onChange={() => set("mentor", !profile.mentor)}>
          Abierto/a a mentorear a quien da su primera charla
        </Chip>
        <Chip checked={profile.public} onChange={() => set("public", !profile.public)}>
          Página pública en owu.uy
        </Chip>
      </div>
      <p className="-mt-3 text-sm text-zinc-400">
        Quienes organizan las comunidades a las que propusiste ven tu perfil igual. La página pública muestra tu perfil
        y las charlas que diste en eventos de OWU.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClassName("secondary", "md")} disabled={save.isPending} type="submit">
          {save.isPending ? "Guardando…" : "Guardar perfil"}
        </button>
        {save.isSuccess && !save.isPending ? (
          <p className="text-sm text-zinc-400" role="status">
            Guardado.{" "}
            {save.data.public ? (
              <Link className="text-zinc-200 underline underline-offset-4" href={`/charlas/oradores/${userId}`}>
                Ver tu página
              </Link>
            ) : null}
          </p>
        ) : null}
        {problem || save.isError ? (
          <p className="text-sm text-red-300" role="alert">
            {problem ?? save.error?.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
