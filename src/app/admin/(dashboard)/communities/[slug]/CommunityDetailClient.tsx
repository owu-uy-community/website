"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { ArrowUpRight, CalendarDays, Settings2, Users } from "lucide-react";

import { CommunityMark } from "components/shared/CommunityMark";
import {
  countDirty,
  SaveBar,
  SettingsCard,
  SettingsLayout,
  SettingsRow,
  SettingsSection,
  UnsavedChangesGuard,
  type SettingsSectionLink,
} from "components/Admin/settings/settings";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { Community } from "lib/orpc/communities/schemas";

import { EventsSection } from "./EventsSection";
import { MembersSection } from "components/Admin/communities/MembersSection";

const SECTIONS: SettingsSectionLink[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "miembros", label: "Miembros", icon: Users },
  { id: "eventos", label: "Eventos", icon: CalendarDays },
];

const communityFormSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre"),
  description: z.string(),
  logoUrl: z.union([
    z.literal(""),
    z.url({ protocol: /^https?$/, error: "Pegá el link completo de la imagen (https://…)" }),
  ]),
  isActive: z.boolean(),
});

type CommunityForm = z.infer<typeof communityFormSchema>;

const toForm = (community: Community): CommunityForm => ({
  name: community.name,
  description: community.description ?? "",
  logoUrl: community.logoUrl ?? "",
  isActive: community.isActive,
});

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

export default function CommunityDetailClient({ initialCommunity }: { initialCommunity: Community }) {
  const queryClient = useQueryClient();
  const input = { communitySlug: initialCommunity.slug };
  const { data: found } = useQuery({
    ...orpc.communities.getBySlug.queryOptions({ input }),
    initialData: initialCommunity,
  });
  const community = found ?? initialCommunity;

  const values = useMemo(() => toForm(community), [community]);
  const form = useForm<CommunityForm>({
    resolver: zodResolver(communityFormSchema),
    mode: "onChange",
    values,
    resetOptions: { keepDirtyValues: true },
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
        for (const key of [
          orpc.communities.list.key(),
          orpc.communities.listForAdmin.key(),
          orpc.openSpaces.listForAdmin.key(),
          orpc.shell.status.key(),
        ]) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        toast.success("Cambios guardados", `${updated.name} ya está al día en el sitio.`);
      },
      onError: (error) => toast.error("No se pudo guardar", reason(error)),
    })
  );

  const save = form.handleSubmit((next) => {
    const data: { name?: string; description?: string | null; logoUrl?: string | null; isActive?: boolean } = {};
    if (dirtyFields.name) data.name = next.name;
    if (dirtyFields.description) data.description = next.description.trim() || null;
    if (dirtyFields.logoUrl) data.logoUrl = next.logoUrl || null;
    if (dirtyFields.isActive) data.isActive = next.isActive;
    update.mutate({ communityId: community.id, data });
  });

  return (
    <SettingsLayout label="Comunidad" sections={SECTIONS}>
      <PageContainer className="pb-6" size="small">
        <PageHeader
          actions={
            community.isActive ? (
              <Button asChild size="sm" variant="outline">
                <a href={`/comunidad/${community.slug}`} rel="noreferrer" target="_blank">
                  Ver en el sitio
                  <ArrowUpRight />
                </a>
              </Button>
            ) : null
          }
          description="Sus datos, su gente y sus eventos."
          meta={
            <>
              {community.isActive ? (
                <Badge variant="success">
                  <StatusDot tone="ok" />
                  Activa
                </Badge>
              ) : (
                <Badge variant="secondary">Inactiva</Badge>
              )}
              <span className="font-terminal text-meta text-muted-foreground">/comunidad/{community.slug}</span>
            </>
          }
          title={
            <span className="flex items-center gap-3">
              <CommunityMark logoUrl={community.logoUrl} name={community.name} size={28} slug={community.slug} />
              {community.name}
            </span>
          }
        />

        <div className="space-y-7">
          <SettingsSection id="general" title="General">
            <SettingsCard>
              <SettingsRow
                dirty={Boolean(dirtyFields.name)}
                error={errors.name?.message}
                hint="Así aparece en el sitio, en el admin y en los mensajes de Owy."
                htmlFor="community-name"
                label="Nombre"
              >
                <Input
                  aria-invalid={Boolean(errors.name)}
                  autoComplete="off"
                  id="community-name"
                  {...register("name")}
                />
              </SettingsRow>
              <SettingsRow
                dirty={Boolean(dirtyFields.description)}
                hint="Aparece debajo del nombre en la página de la comunidad."
                htmlFor="community-description"
                label="Descripción"
              >
                <Textarea className="min-h-[68px]" id="community-description" rows={2} {...register("description")} />
              </SettingsRow>
              <SettingsRow
                dirty={Boolean(dirtyFields.logoUrl)}
                error={errors.logoUrl?.message}
                hint="Una imagen cuadrada; sin logo se usan las iniciales."
                htmlFor="community-logo"
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
                    id="community-logo"
                    inputMode="url"
                    placeholder="https://…/logo.png"
                    type="url"
                    {...register("logoUrl")}
                  />
                </div>
              </SettingsRow>
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <SettingsRow
                    compact
                    dirty={Boolean(dirtyFields.isActive)}
                    hint="Inactiva, su página pública y la de sus eventos dejan de verse. El admin sigue igual."
                    htmlFor="community-active"
                    label="Activa"
                  >
                    <Switch checked={field.value} id="community-active" onCheckedChange={field.onChange} />
                  </SettingsRow>
                )}
              />
            </SettingsCard>
          </SettingsSection>

          <MembersSection communityId={community.id} communityName={community.name} />

          <EventsSection communityId={community.id} communitySlug={community.slug} />
        </div>

        <SaveBar
          count={dirtyCount}
          saving={update.isPending}
          onDiscard={() => form.reset(undefined, { keepDirtyValues: false })}
          onSave={() => void save()}
        />
      </PageContainer>

      <UnsavedChangesGuard count={dirtyCount} />
    </SettingsLayout>
  );
}
