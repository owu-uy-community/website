"use client";

import { useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Trash2, UserPlus } from "lucide-react";

import { EditorPanel, FieldError, Notice } from "components/Admin/panel";
import { SettingsSection } from "components/Admin/settings/settings";
import { Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { usePanel } from "components/organizar/shell/context";
import { ACTIVE_ORGANIZER_DAYS, busFactorLow } from "lib/organizar/health";
import { activeAt } from "lib/organizar/outreach";
import { orpc } from "lib/orpc/client";
import { ASSET_PLATFORMS, PLATFORM_LABELS, type Asset } from "lib/orpc/assets/schemas";

/** The add-member box in Miembros, scrolled to and focused. */
function focusAddMember() {
  document.getElementById("miembros")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector<HTMLInputElement>("#miembros form input")?.focus({ preventScroll: true });
}

/** "Si alguien deja, la comunidad se frena": fewer than two organizers active in 90 days. */
function BusFactor({ communityId }: { communityId: string }) {
  const { can } = usePanel();
  const organizers = useQuery(orpc.insights.organizers.queryOptions({ input: { communityId } }));
  const data = organizers.data;
  if (!data || !busFactorLow(data.active)) return null;
  const active = data.people.filter((person) => activeAt(person.lastActiveAt));

  return (
    <div className="mt-8">
      <Notice tone="warning">
        <p className="font-medium">Si alguien deja, la comunidad se frena: sumá a otra persona.</p>
        <p className="mt-0.5 text-muted-foreground">
          {data.active === 0
            ? `Nadie del equipo usó el panel en ${ACTIVE_ORGANIZER_DAYS} días.`
            : `En ${ACTIVE_ORGANIZER_DAYS} días usó el panel una sola persona${active.length === 1 ? ` (${active[0].name})` : ""}.`}{" "}
          Con dos que se turnan, la agenda sigue aunque una no pueda.
        </p>
        {can("member:create") ? (
          <Button className="mt-2" size="sm" variant="outline" onClick={focusAddMember}>
            <UserPlus />
            Sumar a alguien
          </Button>
        ) : (
          <p className="mt-1 text-meta text-muted-foreground">Pedile a quien administra que sume a alguien.</p>
        )}
      </Notice>
    </div>
  );
}

type Draft = {
  id?: string;
  platform: Asset["platform"];
  label: string;
  holder: string;
  holderName: string;
  backup: string;
  note: string;
};

const OUTSIDE = "__fuera";
const NOBODY = "__nadie";

const draftOf = (asset?: Asset): Draft => ({
  id: asset?.id,
  platform: asset?.platform ?? "meetup",
  label: asset?.label ?? "",
  holder: asset?.holder ? (asset.holder.userId ?? OUTSIDE) : NOBODY,
  holderName: asset?.holder?.userId ? "" : (asset?.holder?.name ?? ""),
  backup: asset?.backup?.userId ?? NOBODY,
  note: asset?.note ?? "",
});

function AssetEditor({
  communityId,
  draft,
  onClose,
}: {
  communityId: string;
  draft: Draft | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Draft>(draft ?? draftOf());
  const [error, setError] = useState<string>();
  const [opened, setOpened] = useState(draft);
  if (draft !== opened) {
    setOpened(draft);
    setForm(draft ?? draftOf());
    setError(undefined);
  }
  const members = useQuery(orpc.communities.members.list.queryOptions({ input: draft ? { communityId } : skipToken }));
  const save = useMutation(
    orpc.assets.save.mutationOptions({
      onSuccess: (asset) => {
        void queryClient.invalidateQueries({ queryKey: orpc.assets.list.key() });
        toast.success(form.id ? "Cuenta actualizada" : "Cuenta anotada", PLATFORM_LABELS[asset.platform]);
        onClose();
      },
      onError: (failure) => setError(failure.message),
    })
  );
  const set = (change: Partial<Draft>) => setForm((current) => ({ ...current, ...change }));
  const people = members.data ?? [];

  return (
    <EditorPanel
      actions={
        <>
          <Button disabled={save.isPending} type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={save.isPending}
            type="button"
            onClick={() =>
              save.mutate({
                communityId,
                id: form.id,
                platform: form.platform,
                label: form.label,
                holderUserId: form.holder === OUTSIDE || form.holder === NOBODY ? null : form.holder,
                holderName: form.holder === OUTSIDE ? form.holderName : "",
                backupUserId: form.backup === NOBODY ? null : form.backup,
                note: form.note,
              })
            }
          >
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
      busy={save.isPending}
      description="Dónde tiene cuenta la comunidad y quién tiene la llave. Nunca guardes contraseñas acá: anotá quién la tiene."
      icon={KeyRound}
      open={draft !== null}
      title={form.id ? "Editar cuenta" : "Sumar una cuenta"}
      onOpenChange={(open) => !open && onClose()}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="asset-platform">Plataforma</Label>
          <Select value={form.platform} onValueChange={(platform) => set({ platform: platform as Draft["platform"] })}>
            <SelectTrigger className="w-full" id="asset-platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_PLATFORMS.map((platform) => (
                <SelectItem key={platform} value={platform}>
                  {PLATFORM_LABELS[platform]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="asset-label">Usuario o link</Label>
          <Input
            data-autofocus
            id="asset-label"
            maxLength={200}
            placeholder="meetup.com/mi-comunidad, @micomunidad, #canal"
            value={form.label}
            onChange={(event) => set({ label: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="asset-holder">Quién la tiene</Label>
          <Select value={form.holder} onValueChange={(holder) => set({ holder })}>
            <SelectTrigger className="w-full" id="asset-holder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Sin anotar</SelectItem>
              {people.map((person) => (
                <SelectItem key={person.userId} value={person.userId}>
                  {person.name}
                </SelectItem>
              ))}
              <SelectItem value={OUTSIDE}>Alguien fuera del equipo</SelectItem>
            </SelectContent>
          </Select>
          {form.holder === OUTSIDE ? (
            <Input
              aria-label="Nombre de quien la tiene"
              maxLength={120}
              placeholder="Su nombre"
              value={form.holderName}
              onChange={(event) => set({ holderName: event.target.value })}
            />
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="asset-backup">Respaldo</Label>
          <Select value={form.backup} onValueChange={(backup) => set({ backup })}>
            <SelectTrigger className="w-full" id="asset-backup">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Nadie todavía</SelectItem>
              {people.map((person) => (
                <SelectItem key={person.userId} value={person.userId}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-meta text-muted-foreground">
            Otra persona del equipo con acceso: si quien la tiene se va, no se pierde.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="asset-note">Nota</Label>
          <Textarea
            id="asset-note"
            maxLength={500}
            placeholder="Cómo se entra (el mail de la comunidad, el 2FA en el teléfono de…). Sin contraseñas."
            rows={3}
            value={form.note}
            onChange={(event) => set({ note: event.target.value })}
          />
        </div>
        <FieldError message={error} />
      </div>
    </EditorPanel>
  );
}

const who = (asset: Asset) =>
  [
    asset.holder ? `La tiene ${asset.holder.name}` : "Nadie anotado la tiene",
    asset.backup ? `respaldo: ${asset.backup.name}` : "sin respaldo",
  ].join(" · ");

/** "Cuentas y accesos": the community's accounts elsewhere and who holds each. Admins only. */
function Assets({ communityId, canEdit }: { communityId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const input = { communityId };
  const assets = useQuery(orpc.assets.list.queryOptions({ input }));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.assets.list.key() });
  const restore = useMutation(orpc.assets.save.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(
    orpc.assets.remove.mutationOptions({
      onSuccess: (_, { id }) => {
        const asset = assets.data?.find((item) => item.id === id);
        refresh();
        if (!asset) return;
        toast.undo(`Sacamos ${PLATFORM_LABELS[asset.platform]} de la lista`, () =>
          restore.mutate({
            communityId,
            platform: asset.platform,
            label: asset.label,
            holderUserId: asset.holder?.userId ?? null,
            holderName: asset.holder?.userId ? "" : (asset.holder?.name ?? ""),
            backupUserId: asset.backup?.userId ?? null,
            note: asset.note,
          })
        );
      },
      onError: (error) => toast.error("No se pudo sacar", error.message),
    })
  );
  const list = assets.data ?? [];

  return (
    <SettingsSection
      actions={
        canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(draftOf())}>
            <Plus />
            Sumar una cuenta
          </Button>
        ) : null
      }
      className="mt-8"
      id="cuentas"
      title="Cuentas y accesos"
    >
      <p className="mb-2 text-meta text-muted-foreground">
        Meetup, Luma, el canal de Slack, las redes: quién tiene cada llave y quién es el respaldo, para que un cambio de
        equipo no pierda ninguna. Nunca guardes contraseñas acá. Lo ven solo quienes administran.
      </p>
      <Panel>
        {assets.isPending ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : assets.isError ? (
          <ErrorState className="m-3" retrying={assets.isFetching} onRetry={() => void assets.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            compact
            description="Anotá el grupo de Meetup, el canal de Slack y las redes: quién las tiene y quién es el respaldo."
            icon={KeyRound}
            title="Todavía no anotaron cuentas"
          />
        ) : (
          <ul>
            {list.map((asset) => (
              <li key={asset.id} className="flex items-start gap-3 border-b border-border p-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-medium text-foreground">
                    {PLATFORM_LABELS[asset.platform]}
                    {asset.label ? (
                      <span className="font-normal text-muted-foreground">{` · ${asset.label}`}</span>
                    ) : null}
                  </p>
                  <p className="text-meta text-muted-foreground">{who(asset)}</p>
                  {asset.note ? <p className="mt-0.5 text-meta text-foreground">{asset.note}</p> : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      aria-label={`Editar ${PLATFORM_LABELS[asset.platform]}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditing(draftOf(asset))}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={`Sacar ${PLATFORM_LABELS[asset.platform]} de la lista`}
                      disabled={remove.isPending}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => remove.mutate({ communityId, id: asset.id })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <AssetEditor communityId={communityId} draft={editing} onClose={() => setEditing(null)} />
    </SettingsSection>
  );
}

/**
 * Equipo's care for the long run: a warning when the community hangs on one person, and the
 * registry of its accounts elsewhere ("Cuentas y accesos") so a handover never loses one.
 */
export function TeamCare({ communityId }: { communityId: string }) {
  const { can } = usePanel();

  return (
    <>
      {can("event:stats") ? <BusFactor communityId={communityId} /> : null}
      {can("member:read") ? <Assets canEdit={can("organization:update")} communityId={communityId} /> : null}
    </>
  );
}
