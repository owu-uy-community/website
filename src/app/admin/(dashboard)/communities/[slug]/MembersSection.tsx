"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { UserMinus, UserPlus, Users } from "lucide-react";

import { ConfirmDialog, FieldError } from "components/Admin/panel";
import { SettingsSection } from "components/Admin/settings/settings";
import { Panel } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { CommunityMember, CommunityRole } from "lib/orpc/communities/schemas";

/** What each role can do, as the API enforces it (see the `inCommunity` levels of each procedure). */
export const ROLES: { value: CommunityRole; label: string; hint: string }[] = [
  { value: "owner", label: "Dueño", hint: "Todo lo de admin, y nombra o quita dueños." },
  { value: "admin", label: "Admin", hint: "Edita la comunidad y maneja su gente y sus roles." },
  { value: "editor", label: "Editor", hint: "Crea y asigna tareas, y manda anuncios al staff." },
  { value: "member", label: "Miembro", hint: "Ve su turno, toma tareas y recibe los anuncios." },
];

const roleOf = (value: CommunityRole) => ROLES.find((role) => role.value === value) ?? ROLES[3];

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

function RoleSelect({
  value,
  onChange,
  disabled,
  label,
  title,
  className = "w-32",
}: {
  value: CommunityRole;
  onChange: (role: CommunityRole) => void;
  disabled?: boolean;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <Select disabled={disabled} value={value} onValueChange={(role) => onChange(role as CommunityRole)}>
      <SelectTrigger aria-label={label} className={className} title={title}>
        {/* Just the name: the items carry a line of what the role can do. */}
        <SelectValue>{roleOf(value).label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="w-72">
        {ROLES.map((role) => (
          <SelectItem key={role.value} className="items-start py-2" value={role.value}>
            {role.label}
            <span className="block text-meta text-muted-foreground">{role.hint}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Who runs the community, with what role. A role change and a removal both ask first; the
 * last owner can't be demoted or removed (the API refuses it too).
 */
export function MembersSection({ communityId, communityName }: { communityId: string; communityName: string }) {
  const queryClient = useQueryClient();
  const listKey = orpc.communities.members.list.key({ input: { communityId } });
  const members = useQuery(orpc.communities.members.list.queryOptions({ input: { communityId } }));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: listKey });
    void queryClient.invalidateQueries({ queryKey: orpc.communities.listForAdmin.key() });
  };

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CommunityRole>("member");
  const [addError, setAddError] = useState<string>();
  const add = useMutation(
    orpc.communities.members.add.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Miembro agregado",
          `${email.trim()} ya es ${roleOf(role).label.toLowerCase()} de ${communityName}.`
        );
        setEmail("");
        setAddError(undefined);
        refresh();
      },
      onError: (error) => setAddError(reason(error)),
    })
  );

  const [pendingRole, setPendingRole] = useState<{ member: CommunityMember; role: CommunityRole } | null>(null);
  const updateRole = useMutation(
    orpc.communities.members.updateRole.mutationOptions({
      onSuccess: () => {
        if (pendingRole)
          toast.success("Rol cambiado", `${pendingRole.member.name} ahora es ${roleOf(pendingRole.role).label}.`);
        setPendingRole(null);
        refresh();
      },
      onError: (error) => {
        setPendingRole(null);
        toast.error("No se pudo cambiar el rol", reason(error));
      },
    })
  );

  const [pendingRemove, setPendingRemove] = useState<CommunityMember | null>(null);
  const remove = useMutation(
    orpc.communities.members.remove.mutationOptions({
      onSuccess: () => {
        if (pendingRemove)
          toast.success("Miembro quitado", `${pendingRemove.name} ya no es parte de ${communityName}.`);
        setPendingRemove(null);
        refresh();
      },
      onError: (error) => {
        setPendingRemove(null);
        toast.error("No se pudo quitar", reason(error));
      },
    })
  );

  const rows = members.data ?? [];
  const owners = rows.filter((member) => member.role === "owner").length;
  const onlyOwner = (member: CommunityMember) => member.role === "owner" && owners <= 1;

  return (
    <SettingsSection id="miembros" title={rows.length ? `Miembros · ${rows.length}` : "Miembros"}>
      <Panel>
        <form
          className="flex flex-wrap items-start gap-2 border-b border-border p-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
              setAddError("Poné el email con el que la persona entró al sitio");
              return;
            }
            add.mutate({ communityId, email: email.trim(), role });
          }}
        >
          <div className="min-w-56 flex-1">
            <Input
              aria-describedby="member-email-error"
              aria-invalid={Boolean(addError)}
              aria-label="Email de la persona"
              autoComplete="off"
              placeholder="persona@ejemplo.com"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setAddError(undefined);
              }}
            />
            <FieldError id="member-email-error" message={addError} />
          </div>
          <RoleSelect label="Rol de la persona nueva" value={role} onChange={setRole} />
          <Button disabled={add.isPending || !email.trim()} type="submit" variant="outline">
            <UserPlus />
            {add.isPending ? "Agregando…" : "Agregar"}
          </Button>
        </form>

        {members.isError ? (
          <ErrorState
            className="m-3"
            retrying={members.isFetching}
            title="No se pudieron cargar los miembros"
            onRetry={() => void members.refetch()}
          />
        ) : members.isPending ? (
          <div aria-hidden className="space-y-2 p-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            description="Agregalas por email: tienen que haber entrado al sitio al menos una vez."
            icon={Users}
            title="Todavía no hay nadie"
          />
        ) : (
          <div className="overflow-x-auto">
            {/* Fixed layout: the person column takes what is left and truncates, so a phone never scrolls sideways. */}
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Persona</TableHead>
                  <TableHead className="w-[7.75rem] sm:w-36">Rol</TableHead>
                  <TableHead className="w-28 max-sm:hidden">Desde</TableHead>
                  <TableHead className="w-11">
                    <span className="sr-only">Quitar</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((member) => {
                  const locked = onlyOwner(member);

                  return (
                    <TableRow key={member.id}>
                      <TableCell className="pl-4">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <PersonAvatar image={member.image} name={member.name} size={28} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{member.name}</p>
                            <p className="truncate text-meta text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleSelect
                          className="w-full"
                          disabled={locked || updateRole.isPending}
                          label={`Rol de ${member.name}`}
                          title={locked ? "Tiene que quedar al menos un dueño" : undefined}
                          value={member.role}
                          onChange={(next) => {
                            if (next !== member.role) setPendingRole({ member, role: next });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-terminal text-meta whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden">
                        {format(new Date(member.createdAt), "d MMM yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="pr-2">
                        <Button
                          aria-label={`Quitar a ${member.name}`}
                          className="text-muted-foreground hover:text-live-foreground"
                          disabled={locked}
                          size="icon-sm"
                          title={locked ? "Tiene que quedar al menos un dueño" : undefined}
                          variant="ghost"
                          onClick={() => setPendingRemove(member)}
                        >
                          <UserMinus />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {owners === 1 ? (
          <p className="border-t border-border px-4 py-2.5 text-meta text-muted-foreground">
            La comunidad tiene un solo dueño: para cambiarle el rol, nombrá a otro primero.
          </p>
        ) : null}
      </Panel>

      <AlertDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open && !updateRole.isPending) setPendingRole(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{pendingRole ? `${pendingRole.member.name} pasa a ${roleOf(pendingRole.role).label}` : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole
                ? `Hoy es ${roleOf(pendingRole.member.role).label}. Como ${roleOf(pendingRole.role).label.toLowerCase()}: ${roleOf(pendingRole.role).hint.charAt(0).toLowerCase()}${roleOf(pendingRole.role).hint.slice(1)}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateRole.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateRole.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingRole) {
                  updateRole.mutate({ communityId, memberId: pendingRole.member.id, role: pendingRole.role });
                }
              }}
            >
              {updateRole.isPending ? "Cambiando…" : "Cambiar el rol"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        confirmLabel="Quitar"
        description={`Deja de ver el staff, las tareas y los anuncios de ${communityName}. Podés volver a agregarla cuando quieras.`}
        open={pendingRemove !== null}
        pending={remove.isPending}
        title={`¿Quitar a ${pendingRemove?.name ?? ""} de ${communityName}?`}
        onConfirm={() => pendingRemove && remove.mutate({ communityId, memberId: pendingRemove.id })}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      />
    </SettingsSection>
  );
}
