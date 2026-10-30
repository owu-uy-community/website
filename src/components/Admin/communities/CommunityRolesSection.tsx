"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";

import { ConfirmDialog, EditorPanel, FieldError, PanelSection } from "components/Admin/panel";
import { SettingsSection } from "components/Admin/settings/settings";
import { Panel } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { parsePermission } from "lib/authz/catalog";
import { COMMUNITY_PERMISSION_LABELS, confOnly, MEETUP_ROLE_HINTS } from "lib/authz/labels";
import { orpc } from "lib/orpc";
import type { CommunityRoleInfo } from "lib/orpc/communities/roles";

/** Over owners and admins stays with those roles: the API refuses them in a custom role. */
const RESERVED = new Set(["member:manage-owners", "member:manage-admins"]);

/** What a custom role may hold, grouped by resource as the editor lists it. */
const GROUPS = Object.entries(COMMUNITY_PERMISSION_LABELS).map(([resource, { label, actions }]) => ({
  resource,
  label,
  permissions: Object.entries(actions)
    .map(([action, text]) => ({ permission: `${resource}:${action}`, label: text }))
    .filter((item) => !RESERVED.has(item.permission)),
}));

const resourceLabel = (resource: string) =>
  (COMMUNITY_PERMISSION_LABELS as Record<string, { label: string }>)[resource]?.label ?? resource;

/** "Eventos, Tareas, Incidentes": the areas a role touches. */
const summary = (permissions: readonly string[]) =>
  [...new Set(permissions.map((permission) => parsePermission(permission)[0]))].map(resourceLabel).join(", ");

const people = (count: number) => (count === 1 ? "1 persona" : `${count} personas`);

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

type Editing = { mode: "new" } | { mode: "edit" | "view"; role: CommunityRoleInfo };

function RoleEditor({
  communityId,
  editing,
  open,
  holds,
  shows,
  onClose,
  onSaved,
}: {
  communityId: string;
  editing: Editing;
  open: boolean;
  holds: (permission: string) => boolean;
  /** Listed in the editor; a hidden permission the role holds stays held on save */
  shows: (permission: string) => boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = editing.mode === "new" ? null : editing.role;
  const readOnly = editing.mode === "view";
  const [label, setLabel] = useState(current?.label ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [selected, setSelected] = useState<string[]>(current?.permissions ?? []);
  const [labelError, setLabelError] = useState<string>();

  const options = (name: string) => ({
    onSuccess: () => {
      toast.success(current ? "Rol guardado" : "Rol creado", `«${name}» ya está listo para asignar.`);
      onSaved();
    },
    onError: (error: unknown) => toast.error("No se pudo guardar el rol", reason(error)),
  });
  const create = useMutation(orpc.communities.roles.create.mutationOptions(options(label.trim())));
  const update = useMutation(orpc.communities.roles.update.mutationOptions(options(label.trim())));
  const saving = create.isPending || update.isPending;

  const toggle = (permissions: string[], on: boolean) =>
    setSelected((list) =>
      on ? [...new Set([...list, ...permissions])] : list.filter((p) => !permissions.includes(p))
    );

  const save = () => {
    const name = label.trim();
    if (name.length < 2) {
      setLabelError("Poné un nombre de al menos 2 letras");
      return;
    }
    const input = { communityId, label: name, description: description.trim(), permissions: selected };
    if (current) update.mutate({ ...input, role: current.role });
    else create.mutate(input);
  };

  return (
    <EditorPanel
      actions={
        readOnly ? (
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button disabled={saving} type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={saving || selected.length === 0} type="button" onClick={save}>
              {saving ? "Guardando…" : current ? "Guardar" : "Crear el rol"}
            </Button>
          </>
        )
      }
      busy={saving}
      description={
        readOnly
          ? current?.builtIn
            ? "Un rol de OWU: es igual en todas las comunidades y no se cambia."
            : "Solo quienes pueden editar roles lo cambian."
          : "Elegí qué puede hacer. Lo que vos no podés hacer aparece apagado."
      }
      icon={ShieldCheck}
      open={open}
      title={editing.mode === "new" ? "Nuevo rol" : readOnly ? current?.label : `Editar «${current?.label}»`}
      onOpenChange={(open) => !open && onClose()}
    >
      <div className="space-y-7">
        {readOnly ? null : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-label">Nombre</Label>
              <Input
                aria-describedby="role-label-error"
                aria-invalid={Boolean(labelError)}
                data-autofocus
                id="role-label"
                maxLength={40}
                placeholder="Prensa, Puerta y sala, Sponsors…"
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                  setLabelError(undefined);
                }}
              />
              <FieldError id="role-label-error" message={labelError} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-description">Descripción</Label>
              <Textarea
                id="role-description"
                maxLength={200}
                placeholder="Qué hace quien tiene este rol, en una línea."
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
        )}

        {GROUPS.map((group) => ({
          ...group,
          permissions: group.permissions.filter((item) => shows(item.permission)),
        })).map((group) => {
          if (group.permissions.length === 0) return null;
          const editable = readOnly ? [] : group.permissions.filter((item) => holds(item.permission));
          const on = group.permissions.filter((item) => selected.includes(item.permission));
          if (readOnly && on.length === 0) return null;
          const all = editable.length > 0 && editable.every((item) => selected.includes(item.permission));

          return (
            <PanelSection
              key={group.resource}
              action={
                editable.length > 1 ? (
                  <Button
                    size="xs"
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      toggle(
                        editable.map((item) => item.permission),
                        !all
                      )
                    }
                  >
                    {all ? "Ninguno" : "Todos"}
                  </Button>
                ) : null
              }
              title={group.label}
            >
              <div className="space-y-1">
                {(readOnly ? on : group.permissions).map((item) => {
                  const id = `perm-${item.permission}`;
                  const disabled = readOnly || !holds(item.permission);

                  return (
                    <label
                      key={item.permission}
                      className="flex min-h-8 items-center gap-2.5 rounded-md px-1 text-ui text-foreground has-[:disabled]:text-muted-foreground"
                      htmlFor={id}
                      title={!readOnly && disabled ? "Vos no lo tenés: no lo podés dar" : undefined}
                    >
                      <Checkbox
                        checked={selected.includes(item.permission)}
                        disabled={disabled}
                        id={id}
                        onCheckedChange={(checked) => toggle([item.permission], checked === true)}
                      />
                      {item.label}
                    </label>
                  );
                })}
              </div>
            </PanelSection>
          );
        })}
      </div>
    </EditorPanel>
  );
}

/**
 * The community's roles: OWU's own (read-only) and the ones it defines. A custom role never holds
 * more than its author, nor power over owners and admins (the API checks both); it's deleted
 * only once nobody holds it. `permissions` are the viewer's (undefined: site staff, who hold all).
 */
export function CommunityRolesSection({
  communityId,
  permissions,
  meetup = false,
}: {
  communityId: string;
  permissions?: readonly string[];
  /** A community that only runs meetups: conference-only permissions and wording stay out of sight */
  meetup?: boolean;
}) {
  const holds = (permission: string) => permissions?.includes(permission) ?? true;
  const shows = (permission: string) => !meetup || !confOnly(permission);
  const queryClient = useQueryClient();
  // Roles feed the members' pickers too.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.communities.key() });
  const roles = useQuery(orpc.communities.roles.list.queryOptions({ input: { communityId } }));

  // Kept while the panel slides out; `key` gives every opening a fresh form.
  const [editor, setEditor] = useState<{ editing: Editing; open: boolean; key: number } | null>(null);
  const edit = (editing: Editing) => setEditor((last) => ({ editing, open: true, key: (last?.key ?? 0) + 1 }));
  const close = () => setEditor((last) => last && { ...last, open: false });
  const [pendingDelete, setPendingDelete] = useState<CommunityRoleInfo | null>(null);
  const remove = useMutation(
    orpc.communities.roles.delete.mutationOptions({
      onSuccess: () => {
        if (pendingDelete) toast.success("Rol borrado", `«${pendingDelete.label}» ya no existe.`);
        setPendingDelete(null);
        refresh();
      },
      onError: (error) => {
        setPendingDelete(null);
        toast.error("No se pudo borrar el rol", reason(error));
      },
    })
  );

  const rows = roles.data ?? [];

  return (
    <SettingsSection
      actions={
        holds("role:create") ? (
          <Button size="sm" variant="outline" onClick={() => edit({ mode: "new" })}>
            <Plus />
            Nuevo rol
          </Button>
        ) : null
      }
      id="roles"
      title={rows.length ? `Roles · ${rows.length}` : "Roles"}
    >
      <Panel>
        {roles.isError ? (
          <ErrorState
            className="m-3"
            retrying={roles.isFetching}
            title="No se pudieron cargar los roles"
            onRetry={() => void roles.refetch()}
          />
        ) : roles.isPending ? (
          <div aria-hidden className="space-y-2 p-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((role) => {
              const editable = !role.builtIn && holds("role:update");
              const description = (role.builtIn && meetup ? MEETUP_ROLE_HINTS[role.role] : null) ?? role.description;

              return (
                <li key={role.role} className="flex items-center gap-2 py-1 pr-2 pl-1">
                  <button
                    className="min-w-0 flex-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
                    type="button"
                    onClick={() => edit({ mode: editable ? "edit" : "view", role })}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-foreground">{role.label}</span>
                      {role.builtIn ? <Badge variant="secondary">De OWU</Badge> : null}
                      <span className="ml-auto shrink-0 font-terminal text-meta text-muted-foreground tabular-nums">
                        {people(role.members)}
                      </span>
                    </span>
                    {description ? (
                      <span className="block truncate text-meta text-muted-foreground">{description}</span>
                    ) : null}
                    <span className="block truncate text-meta text-subtle">
                      {summary(role.permissions.filter(shows))}
                    </span>
                  </button>
                  {!role.builtIn && holds("role:delete") ? (
                    <Button
                      aria-label={`Borrar «${role.label}»`}
                      className="text-muted-foreground hover:text-live-foreground"
                      disabled={role.members > 0}
                      size="icon-sm"
                      title={role.members > 0 ? "Pasá a quienes lo tienen a otro rol primero" : undefined}
                      variant="ghost"
                      onClick={() => setPendingDelete(role)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {editor ? (
        <RoleEditor
          key={editor.key}
          communityId={communityId}
          editing={editor.editing}
          holds={holds}
          open={editor.open}
          shows={shows}
          onClose={close}
          onSaved={() => {
            close();
            refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="Borrar"
        description="Nadie lo tiene, así que a nadie le cambia nada."
        open={pendingDelete !== null}
        pending={remove.isPending}
        pendingLabel="Borrando…"
        title={`¿Borrar el rol «${pendingDelete?.label ?? ""}»?`}
        onConfirm={() => pendingDelete && remove.mutate({ communityId, role: pendingDelete.role })}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </SettingsSection>
  );
}
