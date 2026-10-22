"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { ArrowUpRight } from "lucide-react";

import { cn } from "app/lib/utils";
import { Notice } from "components/Admin/panel";
import {
  countDirty,
  SaveBar,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  UnsavedChangesGuard,
} from "components/Admin/settings/settings";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { CommunityMark } from "components/shared/CommunityMark";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { TOPICS } from "lib/community/topics";
import { orpc } from "lib/orpc/client";
import type { Community } from "lib/orpc/communities/schemas";

const STATUS = [
  { value: "activa", label: "Activa", hint: "Hace eventos." },
  { value: "pausa", label: "En pausa", hint: "Por ahora no hace eventos." },
  { value: "busca-organizadores", label: "Busca organizadores", hint: "Necesita gente que la lleve." },
] as const;

const LINKS = [
  { key: "website", label: "Sitio web", placeholder: "https://…" },
  { key: "meetup", label: "Meetup", placeholder: "https://www.meetup.com/…" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/company/…" },
  { key: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/…" },
] as const;

const link = z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Pegá el link completo (https://…)" })]);

const profileSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre"),
  description: z.string(),
  logoUrl: z.union([
    z.literal(""),
    z.url({ protocol: /^https$/, error: "Pegá el link https de la imagen" }),
    z.string().regex(/^\/images\/communities\//),
  ]),
  status: z.enum(["activa", "pausa", "busca-organizadores"]),
  topics: z.array(z.string()),
  website: link,
  meetup: link,
  linkedin: link,
  instagram: link,
  slackChannel: z.union([
    z.literal(""),
    z.string().regex(/^#?[a-z0-9][a-z0-9_-]{0,79}$/, "El nombre del canal: minúsculas, números, - o _"),
  ]),
});

type ProfileForm = z.infer<typeof profileSchema>;

const toForm = (community: Community): ProfileForm => ({
  name: community.name,
  description: community.description ?? "",
  logoUrl: community.logoUrl ?? "",
  status: community.status,
  topics: community.topics,
  website: community.links.website ?? "",
  meetup: community.links.meetup ?? "",
  linkedin: community.links.linkedin ?? "",
  instagram: community.links.instagram ?? "",
  slackChannel: community.slackChannel ?? "",
});

/** The community's public profile and directory card, as its admins edit it. Editors see it read-only. */
export function ProfileClient({ initialCommunity, canEdit }: { initialCommunity: Community; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const input = { communitySlug: initialCommunity.slug };
  const { data: found } = useQuery({
    ...orpc.communities.getBySlug.queryOptions({ input }),
    initialData: initialCommunity,
  });
  const community = found ?? initialCommunity;

  const values = useMemo(() => toForm(community), [community]);
  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    mode: "onChange",
    values,
    resetOptions: { keepDirtyValues: true },
    disabled: !canEdit,
  });
  const {
    control,
    register,
    watch,
    formState: { dirtyFields, errors },
  } = form;
  const dirtyCount = countDirty(dirtyFields);
  const logoUrl = watch("logoUrl");

  const update = useMutation(
    orpc.communities.update.mutationOptions({
      onSuccess: (updated) => {
        queryClient.setQueryData(orpc.communities.getBySlug.queryKey({ input }), updated);
        form.reset(toForm(updated), { keepDirtyValues: false });
        toast.success("Perfil guardado", "Ya se ve así en el sitio.");
      },
      onError: (error) => toast.error("No se pudo guardar", error.message),
    })
  );

  const save = form.handleSubmit((next) => {
    const data: Parameters<typeof update.mutate>[0]["data"] = {};
    if (dirtyFields.name) data.name = next.name;
    if (dirtyFields.description) data.description = next.description.trim() || null;
    if (dirtyFields.logoUrl) data.logoUrl = next.logoUrl || null;
    if (dirtyFields.status) data.status = next.status;
    if (dirtyFields.topics) data.topics = next.topics as NonNullable<typeof data.topics>;
    if (LINKS.some(({ key }) => dirtyFields[key])) {
      data.links = Object.fromEntries(LINKS.flatMap(({ key }) => (next[key] ? [[key, next[key]]] : [])));
    }
    if (dirtyFields.slackChannel) data.slackChannel = next.slackChannel.replace(/^#/, "") || null;
    update.mutate({ communityId: community.id, data });
  });

  return (
    <PageContainer className="pb-6" size="small">
      <PageHeader
        actions={
          community.isActive ? (
            <Button asChild size="sm" variant="outline">
              <a href={`/comunidad/${community.slug}`} rel="noreferrer" target="_blank">
                Ver perfil
                <ArrowUpRight />
              </a>
            </Button>
          ) : null
        }
        description="Lo que ve la gente en la página de la comunidad y en el directorio."
        meta={<span className="font-terminal text-meta text-muted-foreground">/comunidad/{community.slug}</span>}
        title="Perfil"
      />

      <Notice show={!canEdit} tone="info">
        Solo los admins de la comunidad cambian el perfil.
      </Notice>

      <div className="space-y-7">
        <SettingsSection id="general" title="General">
          <SettingsCard>
            <SettingsRow
              dirty={Boolean(dirtyFields.name)}
              error={errors.name?.message}
              htmlFor="profile-name"
              label="Nombre"
            >
              <Input aria-invalid={Boolean(errors.name)} autoComplete="off" id="profile-name" {...register("name")} />
            </SettingsRow>
            <SettingsRow
              dirty={Boolean(dirtyFields.description)}
              hint="Una o dos frases: de qué va y a quién junta."
              htmlFor="profile-description"
              label="Descripción"
            >
              <Textarea className="min-h-[68px]" id="profile-description" rows={3} {...register("description")} />
            </SettingsRow>
            <SettingsRow
              dirty={Boolean(dirtyFields.logoUrl)}
              error={errors.logoUrl?.message}
              hint="Una imagen cuadrada; sin logo se usan las iniciales."
              htmlFor="profile-logo"
              label="Logo"
            >
              <div className="flex items-center gap-2">
                <CommunityMark
                  logoUrl={logoUrl && !errors.logoUrl ? logoUrl : null}
                  name={watch("name") || community.name}
                  size={32}
                  slug={community.slug}
                />
                <Input
                  aria-invalid={Boolean(errors.logoUrl)}
                  autoComplete="off"
                  id="profile-logo"
                  inputMode="url"
                  placeholder="https://…/logo.png"
                  {...register("logoUrl")}
                />
              </div>
            </SettingsRow>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <SettingsRow dirty={Boolean(dirtyFields.status)} htmlFor="profile-status" label="Estado">
                  <Select disabled={field.disabled} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-56" id="profile-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map((status) => (
                        <SelectItem key={status.value} className="items-start py-2" value={status.value}>
                          {status.label}
                          <span className="block text-meta text-muted-foreground">{status.hint}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingsRow>
              )}
            />
            <Controller
              control={control}
              name="topics"
              render={({ field }) => (
                <SettingsRow
                  dirty={Boolean(dirtyFields.topics)}
                  hint="Hasta 5. Filtran el directorio y el calendario los usa para avisar choques."
                  label="Temas"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {TOPICS.map((topic) => {
                      const on = field.value.includes(topic.value);

                      return (
                        <button
                          key={topic.value}
                          aria-pressed={on}
                          className={cn(
                            "rounded-md border px-2 py-1 text-meta transition-colors disabled:opacity-60",
                            on
                              ? "border-primary/60 bg-primary-surface text-foreground"
                              : "border-input text-muted-foreground hover:text-foreground"
                          )}
                          disabled={field.disabled || (!on && field.value.length >= 5)}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              on ? field.value.filter((value) => value !== topic.value) : [...field.value, topic.value]
                            )
                          }
                        >
                          {topic.label}
                        </button>
                      );
                    })}
                  </div>
                </SettingsRow>
              )}
            />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection id="links" title="Dónde encontrarla">
          <SettingsCard>
            <SettingsRow
              dirty={Boolean(dirtyFields.slackChannel)}
              error={errors.slackChannel?.message}
              hint="El canal en el Slack de OWU: el perfil muestra «Unirme a #canal»."
              htmlFor="profile-slack"
              label="Canal de Slack"
            >
              <Input
                aria-invalid={Boolean(errors.slackChannel)}
                autoComplete="off"
                id="profile-slack"
                placeholder="montevideo-js"
                {...register("slackChannel")}
              />
            </SettingsRow>
            {LINKS.map(({ key, label, placeholder }) => (
              <SettingsRow
                key={key}
                dirty={Boolean(dirtyFields[key])}
                error={errors[key]?.message}
                htmlFor={`profile-${key}`}
                label={label}
              >
                <Input
                  aria-invalid={Boolean(errors[key])}
                  autoComplete="off"
                  id={`profile-${key}`}
                  inputMode="url"
                  placeholder={placeholder}
                  type="url"
                  {...register(key)}
                />
              </SettingsRow>
            ))}
          </SettingsCard>
        </SettingsSection>
      </div>

      {canEdit ? (
        <SaveBar
          count={dirtyCount}
          saving={update.isPending}
          onDiscard={() => form.reset(undefined, { keepDirtyValues: false })}
          onSave={() => void save()}
        />
      ) : null}
      <UnsavedChangesGuard count={dirtyCount} />
    </PageContainer>
  );
}
