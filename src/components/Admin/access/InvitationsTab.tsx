"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Ticket, X } from "lucide-react";

import { ConfirmDialog, FieldError, SegmentedTabsList } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { Tabs } from "components/shared/ui/tabs";
import { toast } from "components/shared/ui/toast-utils";
import type { PlatformRole } from "lib/authz/catalog";
import { orpc } from "lib/orpc";
import type { Invitation } from "lib/orpc/access/schemas";

import { RoleBadges, RoleChecklist, useDebounced, type Can } from "./shared";

/** Site roles worth inviting someone to (machines get keys, not invitations). */
const INVITABLE: PlatformRole[] = ["moderator", "staff", "superadmin"];

/** Invitaciones: every pending one, the site's and each community's; and inviting to the site's staff. */
export function InvitationsTab({ can }: { can: Can }) {
  const queryClient = useQueryClient();
  const invitations = useQuery(orpc.access.invitations.list.queryOptions({ input: { scope: "all" } }));
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [inviting, setInviting] = useState(false);
  const revoke = useMutation(
    orpc.access.invitations.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Invitación cancelada");
        setRevoking(null);
        void queryClient.invalidateQueries({ queryKey: orpc.access.invitations.key() });
      },
      onError: (error) => {
        setRevoking(null);
        toast.error("No se pudo cancelar", error.message);
      },
    })
  );

  const rows = invitations.data ?? [];

  return (
    <Panel>
      <PanelHead
        actions={
          can("user:set-role") ? (
            <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
              <MailPlus />
              Invitar al staff
            </Button>
          ) : null
        }
        icon={Ticket}
        meta={rows.length || undefined}
        title="Invitaciones pendientes"
      />
      {invitations.isError ? (
        <ErrorState
          className="m-3"
          retrying={invitations.isFetching}
          title="No se pudieron cargar las invitaciones"
          onRetry={() => void invitations.refetch()}
        />
      ) : invitations.isPending ? (
        <div aria-hidden className="space-y-2 p-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          description="Una invitación da un rol apenas la persona entra con ese email o ese Slack."
          icon={Ticket}
          title="Ninguna pendiente"
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Para</TableHead>
                <TableHead className="w-40">Rol</TableHead>
                <TableHead className="w-40 max-md:hidden">Invitó</TableHead>
                <TableHead className="w-24 max-sm:hidden">Vence</TableHead>
                <TableHead className="w-11">
                  <span className="sr-only">Cancelar</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="pl-4">
                    <p className="truncate text-foreground">
                      {invitation.name ?? invitation.email ?? invitation.slackUserId}
                      {invitation.slackUserId ? (
                        <span className="font-terminal text-meta text-muted-foreground"> · Slack</span>
                      ) : invitation.name && invitation.email ? (
                        <span className="text-meta text-muted-foreground"> · {invitation.email}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-meta text-muted-foreground">
                      {invitation.communityName ?? "El sitio"}
                      {invitation.note ? ` · ${invitation.note}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <RoleBadges roles={invitation.role} />
                  </TableCell>
                  <TableCell className="truncate text-meta text-muted-foreground max-md:hidden">
                    {invitation.invitedBy?.name ?? "—"} ·{" "}
                    <RelativeTime className="text-meta" date={invitation.createdAt} />
                  </TableCell>
                  <TableCell className="max-sm:hidden">
                    <RelativeTime date={invitation.expiresAt} />
                  </TableCell>
                  <TableCell className="pr-2">
                    {can("invitation:cancel") ? (
                      <Button
                        aria-label="Cancelar la invitación"
                        className="text-muted-foreground hover:text-live-foreground"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setRevoking(invitation)}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Cancelar la invitación"
        description="Si la persona entra después, no recibe el rol."
        open={revoking !== null}
        pending={revoke.isPending}
        pendingLabel="Cancelando…"
        title={`¿Cancelar la invitación para ${revoking?.name ?? revoking?.email ?? revoking?.slackUserId ?? ""}?`}
        onConfirm={() => revoking && revoke.mutate({ invitationId: revoking.id })}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      />
      {/* Remounted per opening: the form starts empty. */}
      {inviting ? <InviteDialog onClose={() => setInviting(false)} /> : null}
    </Panel>
  );
}

type SlackPick = { id: string; name: string; image: string | null };

function InviteDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [by, setBy] = useState<"slack" | "email">("slack");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim(), 250);
  const [picked, setPicked] = useState<SlackPick | null>(null);
  const [roles, setRoles] = useState<PlatformRole[]>(["staff"]);
  const [note, setNote] = useState("");
  const [days, setDays] = useState("30");
  const [error, setError] = useState<string>();
  const members = useQuery(
    orpc.access.slackMembers.queryOptions({
      input: { q: term },
      enabled: by === "slack" && !picked && term.length >= 2,
      staleTime: 60_000,
    })
  );
  const create = useMutation(
    orpc.access.invitations.create.mutationOptions({
      onSuccess: () => {
        toast.success("Invitación creada", "El rol se aplica apenas entre con el Slack de OWU.");
        void queryClient.invalidateQueries({ queryKey: orpc.access.invitations.key() });
        onClose();
      },
      onError: (failure) => setError(failure.message),
    })
  );

  const submit = () => {
    const count = Number(days);
    if (by === "email" && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Poné un email válido");
    if (by === "slack" && !picked) return setError("Elegí a alguien del Slack de OWU");
    if (roles.length === 0) return setError("Elegí al menos un rol");
    if (!(Number.isInteger(count) && count >= 1 && count <= 180)) return setError("Entre 1 y 180 días");
    create.mutate({
      ...(by === "email" ? { email: email.trim() } : { slackUserId: picked?.id, name: picked?.name }),
      roles,
      note: note.trim(),
      days: count,
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !create.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar al staff del sitio</DialogTitle>
          <DialogDescription>Los roles se aplican cuando la persona entra con el Slack de OWU.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          id="invite-staff"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Tabs
            value={by}
            onValueChange={(next) => {
              setBy(next as "slack" | "email");
              setError(undefined);
            }}
          >
            <SegmentedTabsList
              items={[
                { value: "slack", label: "Slack de OWU" },
                { value: "email", label: "Email" },
              ]}
              value={by}
            />
          </Tabs>

          {by === "email" ? (
            <Input
              aria-label="Email"
              autoComplete="off"
              placeholder="persona@ejemplo.com"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(undefined);
              }}
            />
          ) : picked ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
              <PersonAvatar image={picked.image} name={picked.name} size={24} />
              <span className="min-w-0 flex-1 truncate text-ui text-foreground">{picked.name}</span>
              <Button size="sm" type="button" variant="ghost" onClick={() => setPicked(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                aria-label="Buscar en el Slack de OWU"
                autoComplete="off"
                placeholder="Nombre en Slack"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setError(undefined);
                }}
              />
              {term.length >= 2 ? (
                <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {members.isPending ? (
                    <li className="px-3 py-2 text-meta text-muted-foreground">Buscando…</li>
                  ) : members.isError ? (
                    <li className="px-3 py-2 text-meta text-live-foreground">{members.error.message}</li>
                  ) : (members.data ?? []).length === 0 ? (
                    <li className="px-3 py-2 text-meta text-muted-foreground">Nadie con ese nombre.</li>
                  ) : (
                    (members.data ?? []).map((member) => (
                      <li key={member.id}>
                        <button
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline-hidden"
                          type="button"
                          onClick={() => setPicked(member)}
                        >
                          <PersonAvatar image={member.image} name={member.name} size={24} />
                          <span className="min-w-0 flex-1 truncate text-ui text-foreground">{member.name}</span>
                          {member.title ? (
                            <span className="truncate text-meta text-muted-foreground">{member.title}</span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          )}

          <RoleChecklist id="invite-roles" roles={INVITABLE} value={roles} onChange={setRoles} />

          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <Label htmlFor="invite-note">Nota</Label>
              <Input
                id="invite-note"
                maxLength={300}
                placeholder="Para qué la sumamos"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-days">Vence en días</Label>
              <Input
                id="invite-days"
                inputMode="numeric"
                max={180}
                min={1}
                type="number"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
          </div>
          <FieldError message={error} />
        </form>
        <DialogFooter>
          <Button disabled={create.isPending} variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={create.isPending} form="invite-staff" type="submit">
            {create.isPending ? "Invitando…" : "Invitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
