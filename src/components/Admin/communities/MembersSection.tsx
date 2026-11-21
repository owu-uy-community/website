"use client";

import { useEffect, useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, UserMinus, UserPlus, Users, X } from "lucide-react";

import { ConfirmDialog, FieldError } from "components/Admin/panel";
import { SettingsSection } from "components/Admin/settings/settings";
import { MicroLabel, Panel } from "components/Admin/ui/page";
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
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/shared/ui/tooltip";
import { COMMUNITY_ROLE_GRANTS } from "lib/authz/catalog";
import { MEETUP_ROLE_HINTS, ROLE_LABELS, roleLabel } from "lib/authz/labels";
import { orpc } from "lib/orpc";
import type { CommunityMember } from "lib/orpc/communities/schemas";

type RoleOption = { role: string; label: string; description: string };
type SlackPerson = { id: string; name: string; title: string; image: string | null };

/** The built-ins, for whoever can't read the community's roles (`role:read`). */
const BUILT_IN_ROLES: RoleOption[] = Object.keys(COMMUNITY_ROLE_GRANTS).map((role) => ({
  role,
  label: roleLabel(role),
  description: ROLE_LABELS[role]?.hint ?? "",
}));

const EMAIL = /^\S+@\S+\.\S+$/;

const INVITED = "Le dejamos la invitación: se suma cuando entre con el Slack de OWU.";

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}

function RoleSelect({
  value,
  valueLabel,
  options,
  onChange,
  disabled,
  label,
  title,
  className = "w-32",
}: {
  value: string;
  /** The value's name: it may not be among the options (an owner, for someone who can't name owners). */
  valueLabel: string;
  options: RoleOption[];
  onChange: (role: string) => void;
  disabled?: boolean;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <Select disabled={disabled} value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className} title={title}>
        {/* Just the name: the items carry a line of what the role can do. */}
        <SelectValue>{valueLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="w-72">
        {options.map((role) => (
          <SelectItem key={role.role} className="items-start py-2" value={role.role}>
            {role.label}
            {role.description ? (
              <span className="block text-meta text-muted-foreground">{role.description}</span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "Sin Slack de OWU", with what it means on hover. */
function NoSlackBadge({ hint }: { hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="cursor-default" tabIndex={0} variant="warning">
          Sin Slack de OWU
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Who runs the community, with what role; the invitations waiting for someone's OWU Slack and the
 * requests to join. A role change and a removal both ask first; the last owner can't be demoted
 * or removed (the API refuses it too). `permissions` are the viewer's in the community: controls
 * they can't use are hidden (undefined: site staff, who hold everything).
 */
export function MembersSection({
  communityId,
  communityName,
  permissions,
  meetup = false,
}: {
  communityId: string;
  communityName: string;
  permissions?: readonly string[];
  /** A community that only runs meetups: roles described without the conference's staff of the day */
  meetup?: boolean;
}) {
  const can = (permission: string) => permissions?.includes(permission) ?? true;
  const [canAdd, canUpdate, canDelete] = [can("member:create"), can("member:update"), can("member:delete")];

  const queryClient = useQueryClient();
  // Members, roles (their counts), invitations, requests and the admin's list all move together.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.communities.key() });
  const input = { communityId };
  const members = useQuery(orpc.communities.members.list.queryOptions({ input }));
  const roles = useQuery(orpc.communities.roles.list.queryOptions({ input: can("role:read") ? input : skipToken }));
  const invitations = useQuery(orpc.communities.invitations.list.queryOptions({ input }));
  const requests = useQuery(orpc.communities.requests.list.queryOptions({ input }));

  const rows = members.data ?? [];
  // Only for the date in the "Sin Slack de OWU" hint.
  const me = useQuery({ ...orpc.access.me.queryOptions(), enabled: rows.some((member) => !member.owuSlack) });
  const deadline = me.data ? new Date(me.data.owuSlackRequiredFrom) : null;
  const noSlackHint =
    deadline && deadline.getTime() > Date.now()
      ? `Su rol deja de contar el ${format(deadline, "d 'de' MMMM", { locale: es })} si no entra con el Slack de OWU.`
      : "Su rol no cuenta hasta que entre con el Slack de OWU.";

  const allRoles: RoleOption[] = (roles.data ?? BUILT_IN_ROLES).map((option) => ({
    ...option,
    description: (meetup ? MEETUP_ROLE_HINTS[option.role] : null) ?? option.description,
  }));
  const nameOf = (role: string) => allRoles.find((option) => option.role === role)?.label ?? roleLabel(role);
  // Naming or changing owners and admins takes its own permission (the API checks escalation too).
  const guarded = (role: string) =>
    (role === "owner" && !can("member:manage-owners")) || (role === "admin" && !can("member:manage-admins"));
  const assignable = allRoles.filter((option) => !guarded(option.role));

  const [who, setWho] = useState("");
  const [picked, setPicked] = useState<SlackPerson | null>(null);
  const [role, setRole] = useState("member");
  const [addError, setAddError] = useState<string>();
  const term = who.trim();
  const debounced = useDebounced(term, 250);
  // Anything that isn't an email looks for someone on the OWU Slack by name.
  const slackTerm = canAdd && !picked && debounced.length >= 2 && !debounced.includes("@") ? debounced : null;
  const slack = useQuery(orpc.access.slackMembers.queryOptions({ input: slackTerm ? { q: slackTerm } : skipToken }));
  const add = useMutation(
    orpc.communities.members.add.mutationOptions({
      onSuccess: (result, variables) => {
        const name = picked?.name ?? variables.email ?? "La persona";
        if (result.status === "added") {
          toast.success(
            "Persona sumada",
            `${name} ya es ${nameOf(variables.role ?? "member").toLowerCase()} de ${communityName}.`
          );
        } else {
          toast.success(`Invitamos a ${name}`, INVITED);
        }
        setWho("");
        setPicked(null);
        setAddError(undefined);
        refresh();
      },
      onError: (error) => toast.error("No se pudo sumar", reason(error)),
    })
  );

  const [pendingRole, setPendingRole] = useState<{ member: CommunityMember; role: string } | null>(null);
  const updateRole = useMutation(
    orpc.communities.members.updateRole.mutationOptions({
      onSuccess: () => {
        if (pendingRole)
          toast.success("Rol cambiado", `${pendingRole.member.name} ahora es ${nameOf(pendingRole.role)}.`);
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

  const revoke = useMutation(
    orpc.communities.invitations.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Invitación cancelada");
        refresh();
      },
      onError: (error) => toast.error("No se pudo cancelar la invitación", reason(error)),
    })
  );

  const [approveAs, setApproveAs] = useState<Record<string, string>>({});
  const decide = useMutation(
    orpc.communities.requests.decide.mutationOptions({
      onSuccess: (result, variables) => {
        const request = requests.data?.find((item) => item.id === variables.requestId);
        const name = request?.user.name ?? "La persona";
        if (result.status === "rejected") toast.success("Pedido rechazado", `Le avisamos a ${name} por email.`);
        else if (!result.invited)
          toast.success(
            "Pedido aprobado",
            `${name} ya es ${nameOf(result.grantedRole ?? "member").toLowerCase()} de ${communityName}.`
          );
        else toast.success("Pedido aprobado", INVITED);
        refresh();
      },
      onError: (error) => toast.error("No se pudo resolver el pedido", reason(error)),
    })
  );

  const owners = rows.filter((member) => member.role === "owner").length;
  const lockOf = (member: CommunityMember) =>
    member.role === "owner" && owners <= 1
      ? "Tiene que quedar al menos un dueño"
      : guarded(member.role)
        ? `Solo un dueño puede cambiar a ${member.role === "owner" ? "otro dueño" : "un admin"}`
        : undefined;

  const pendingInvitations = invitations.data ?? [];
  const pendingRequests = (requests.data ?? []).filter((request) => request.status === "pending");
  // ponytail: the last few decisions only; a full history belongs in the audit log.
  const decidedRequests = (requests.data ?? [])
    .filter((request) => request.status === "approved" || request.status === "rejected")
    .slice(0, 5);

  return (
    <SettingsSection id="miembros" title={rows.length ? `Miembros · ${rows.length}` : "Miembros"}>
      <Panel>
        {canAdd ? (
          <form
            className="flex flex-wrap items-start gap-2 border-b border-border p-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (picked) add.mutate({ communityId, slackUserId: picked.id, name: picked.name, role });
              else if (EMAIL.test(term)) add.mutate({ communityId, email: term, role });
              else setAddError("Escribí su email o elegí a alguien del Slack de OWU");
            }}
          >
            <div className="min-w-56 flex-1">
              {picked ? (
                <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background pr-1 pl-2 shadow-edge sm:h-8">
                  <PersonAvatar image={picked.image} name={picked.name} size={20} />
                  <span className="min-w-0 flex-1 truncate text-ui text-foreground">{picked.name}</span>
                  <Button
                    aria-label="Elegir a otra persona"
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                    onClick={() => setPicked(null)}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <Input
                  aria-describedby="member-who-error"
                  aria-invalid={Boolean(addError)}
                  aria-label="Email o nombre en el Slack de OWU"
                  autoComplete="off"
                  placeholder="Email o nombre en el Slack de OWU"
                  value={who}
                  onChange={(event) => {
                    setWho(event.target.value);
                    setAddError(undefined);
                  }}
                />
              )}
              <FieldError id="member-who-error" message={addError} />
              {slackTerm && slack.data ? (
                slack.data.length > 0 ? (
                  <ul
                    aria-label="Personas en el Slack de OWU"
                    className="mt-1.5 overflow-hidden rounded-md border border-border bg-popover"
                  >
                    {slack.data.map((person) => (
                      <li key={person.id}>
                        <button
                          className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-hidden pointer-coarse:py-2.5"
                          type="button"
                          onClick={() => {
                            setPicked(person);
                            setWho("");
                          }}
                        >
                          <PersonAvatar image={person.image} name={person.name} size={24} />
                          <span className="min-w-0">
                            <span className="block truncate text-ui text-foreground">{person.name}</span>
                            {person.title ? (
                              <span className="block truncate text-meta text-muted-foreground">{person.title}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pt-1.5 text-meta text-muted-foreground">
                    Nadie en el Slack de OWU con ese nombre. Probá con su email.
                  </p>
                )
              ) : null}
            </div>
            <RoleSelect
              label="Rol de la persona nueva"
              options={assignable}
              value={role}
              valueLabel={nameOf(role)}
              onChange={setRole}
            />
            <Button disabled={add.isPending || (!picked && !term)} type="submit" variant="outline">
              <UserPlus />
              {add.isPending ? "Sumando…" : "Sumar"}
            </Button>
          </form>
        ) : null}

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
            description="Sumalas por email o por su nombre en el Slack de OWU."
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
                  {canDelete ? (
                    <TableHead className="w-11">
                      <span className="sr-only">Quitar</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((member) => {
                  const lock = lockOf(member);

                  return (
                    <TableRow key={member.id}>
                      <TableCell className="pl-4">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <PersonAvatar image={member.image} name={member.name} size={28} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{member.name}</p>
                            {/* Beside the email, not the name: on a phone the name stays readable. */}
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="truncate text-meta text-muted-foreground">{member.email}</p>
                              {member.owuSlack ? null : <NoSlackBadge hint={noSlackHint} />}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canUpdate ? (
                          <RoleSelect
                            className="w-full"
                            disabled={Boolean(lock) || updateRole.isPending}
                            label={`Rol de ${member.name}`}
                            options={assignable}
                            title={lock}
                            value={member.role}
                            valueLabel={nameOf(member.role)}
                            onChange={(next) => {
                              if (next !== member.role) setPendingRole({ member, role: next });
                            }}
                          />
                        ) : (
                          <span className="block truncate text-ui text-foreground">{nameOf(member.role)}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-terminal text-meta whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden">
                        {format(new Date(member.createdAt), "d MMM yyyy", { locale: es })}
                      </TableCell>
                      {canDelete ? (
                        <TableCell className="pr-2">
                          <Button
                            aria-label={`Quitar a ${member.name}`}
                            className="text-muted-foreground hover:text-live-foreground"
                            disabled={Boolean(lock)}
                            size="icon-sm"
                            title={lock}
                            variant="ghost"
                            onClick={() => setPendingRemove(member)}
                          >
                            <UserMinus />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {owners === 1 && canUpdate ? (
          <p className="border-t border-border px-4 py-2.5 text-meta text-muted-foreground">
            La comunidad tiene un solo dueño: para cambiarle el rol, nombrá a otro primero.
          </p>
        ) : null}
      </Panel>

      {invitations.isError ? (
        <ErrorState
          compact
          className="mt-4"
          retrying={invitations.isFetching}
          title="No se pudieron cargar las invitaciones"
          onRetry={() => void invitations.refetch()}
        />
      ) : pendingInvitations.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2">
            <MicroLabel>Invitaciones pendientes · {pendingInvitations.length}</MicroLabel>
          </h3>
          <Panel>
            <ul className="divide-y divide-border">
              {pendingInvitations.map((invitation) => {
                const to = invitation.name ?? invitation.email ?? `Slack · ${invitation.slackUserId ?? ""}`;

                return (
                  <li key={invitation.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui text-foreground">{to}</p>
                      <p className="truncate text-meta text-muted-foreground">
                        {nameOf(invitation.role)} · vence el{" "}
                        {format(new Date(invitation.expiresAt), "d MMM", { locale: es })}
                        {invitation.invitedBy ? ` · invitó ${invitation.invitedBy.name}` : ""}
                      </p>
                    </div>
                    {can("invitation:cancel") ? (
                      <Button
                        aria-label={`Cancelar la invitación a ${to}`}
                        className="text-muted-foreground hover:text-live-foreground"
                        disabled={revoke.isPending && revoke.variables.invitationId === invitation.id}
                        size="icon-sm"
                        title="Cancelar la invitación"
                        variant="ghost"
                        onClick={() => revoke.mutate({ communityId, invitationId: invitation.id })}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      ) : null}

      {requests.isError ? (
        <ErrorState
          compact
          className="mt-4"
          retrying={requests.isFetching}
          title="No se pudieron cargar los pedidos"
          onRetry={() => void requests.refetch()}
        />
      ) : pendingRequests.length + decidedRequests.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2">
            <MicroLabel>
              Pedidos para sumarse{pendingRequests.length > 0 ? ` · ${pendingRequests.length}` : ""}
            </MicroLabel>
          </h3>
          <Panel>
            <ul className="divide-y divide-border">
              {[...pendingRequests, ...decidedRequests].map((request) => {
                const deciding = decide.isPending && decide.variables.requestId === request.id;
                const as = approveAs[request.id] ?? "member";

                return (
                  <li key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3 pl-4">
                    <div className="flex min-w-0 flex-1 basis-56 items-start gap-2.5">
                      <PersonAvatar image={request.user.image} name={request.user.name} size={28} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate font-medium text-foreground">{request.user.name}</p>
                          {request.status === "pending" && !request.user.owuSlack ? (
                            <NoSlackBadge hint="Si lo aprobás, queda invitado: se suma cuando entre con el Slack de OWU." />
                          ) : null}
                        </div>
                        <p className="truncate text-meta text-muted-foreground">
                          {request.user.email} · {format(new Date(request.createdAt), "d MMM", { locale: es })}
                        </p>
                        {request.message ? (
                          <p className="mt-1 line-clamp-2 text-meta text-subtle">«{request.message}»</p>
                        ) : null}
                      </div>
                    </div>
                    {request.status !== "pending" ? (
                      <span className="ml-auto flex items-center gap-2 text-meta text-muted-foreground">
                        {request.status === "approved" ? (
                          <Badge variant="success">Aprobado · {nameOf(request.grantedRole ?? "member")}</Badge>
                        ) : (
                          <Badge variant="secondary">Rechazado</Badge>
                        )}
                        {request.decidedBy ? <span className="max-sm:hidden">por {request.decidedBy.name}</span> : null}
                      </span>
                    ) : canAdd ? (
                      <div className="ml-auto flex items-center gap-1.5">
                        <RoleSelect
                          disabled={deciding}
                          label={`Rol para ${request.user.name}`}
                          options={assignable}
                          value={as}
                          valueLabel={nameOf(as)}
                          onChange={(next) => setApproveAs((current) => ({ ...current, [request.id]: next }))}
                        />
                        <Button
                          disabled={deciding}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            decide.mutate({ communityId, requestId: request.id, decision: "approve", role: as })
                          }
                        >
                          <Check />
                          Aprobar
                        </Button>
                        <Button
                          disabled={deciding}
                          size="sm"
                          variant="ghost"
                          onClick={() => decide.mutate({ communityId, requestId: request.id, decision: "reject" })}
                        >
                          Rechazar
                        </Button>
                      </div>
                    ) : (
                      <Badge className="ml-auto" variant="warning">
                        Pendiente
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      ) : null}

      <AlertDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open && !updateRole.isPending) setPendingRole(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{pendingRole ? `${pendingRole.member.name} pasa a ${nameOf(pendingRole.role)}` : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole
                ? [
                    `Hoy es ${nameOf(pendingRole.member.role)}.`,
                    allRoles.find((option) => option.role === pendingRole.role)?.description,
                  ]
                    .filter(Boolean)
                    .join(" ")
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
        description={
          meetup
            ? `Deja de ser parte del equipo de ${communityName}. Podés volver a sumarla cuando quieras.`
            : `Deja de ver el staff, las tareas y los anuncios de ${communityName}. Podés volver a sumarla cuando quieras.`
        }
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
