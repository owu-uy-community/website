"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Eye, LogOut, Search, UserRound, Users } from "lucide-react";

import { authClient } from "app/lib/auth-client";
import { EditorPanel, FieldError, Notice, PanelSection } from "components/Admin/panel";
import { Panel } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import type { PlatformRole } from "lib/authz/catalog";
import { roleLabel } from "lib/authz/labels";
import { OWU_SLACK_TEAM_ID } from "lib/authz/slack";
import { orpc } from "lib/orpc";
import type { PersonDetail } from "lib/orpc/access/schemas";

import { deviceOf, isPlatformRole, PERSON_ROLES, RoleBadges, RoleChecklist, useDebounced, type Can } from "./shared";

const PAGE = 50;

type Filter = "all" | "any" | "banned" | PlatformRole;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas las personas" },
  { value: "any", label: "Con algún rol" },
  ...PERSON_ROLES.map((role) => ({ value: role, label: roleLabel(role) })),
  { value: "banned", label: "Suspendidas" },
];

const day = (iso: string) => format(new Date(iso), "d MMM yyyy", { locale: es });

/** Personas: search, filter by role, and a sheet per person. */
export function PeopleTab({ can, meId }: { can: Can; meId: string }) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 250);
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const people = useQuery(
    orpc.access.users.list.queryOptions({
      input: {
        q: term,
        limit: PAGE,
        offset,
        ...(filter === "banned" ? { banned: true } : filter === "all" ? {} : { role: filter }),
      },
      placeholderData: keepPreviousData,
    })
  );
  // The sheet keeps showing the last person while it slides shut.
  const [shown, setShown] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const show = (userId: string) => {
    setShown(userId);
    setOpen(true);
  };

  const rows = people.data?.people ?? [];
  const total = people.data?.total ?? 0;

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-56 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Buscar por nombre o email"
              className="pl-8"
              placeholder="Nombre o email"
              type="search"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setOffset(0);
              }}
            />
          </div>
          <Select
            value={filter}
            onValueChange={(next) => {
              setFilter(next as Filter);
              setOffset(0);
            }}
          >
            <SelectTrigger aria-label="Filtrar por rol" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {FILTERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {people.isError ? (
          <ErrorState
            className="m-3"
            retrying={people.isFetching}
            title="No se pudo cargar la gente"
            onRetry={() => void people.refetch()}
          />
        ) : people.isPending ? (
          <div aria-hidden className="space-y-2 p-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState compact description="Probá con otro nombre o sacá el filtro." icon={Users} title="Nadie" />
        ) : (
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Persona</TableHead>
                  <TableHead className="w-36 sm:w-48">Roles del sitio</TableHead>
                  <TableHead className="w-24 max-md:hidden">Slack OWU</TableHead>
                  <TableHead className="w-28 max-md:hidden">Comunidades</TableHead>
                  <TableHead className="w-28 max-sm:hidden">Última vez</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((person) => (
                  <TableRow key={person.id} className="cursor-pointer" onClick={() => show(person.id)}>
                    <TableCell className="pl-4">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <PersonAvatar image={person.image} name={person.name} size={28} />
                        <div className="min-w-0">
                          {/* The row opens the sheet; the button makes it reachable by keyboard. */}
                          <button
                            className="block max-w-full truncate rounded-sm text-left font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
                            type="button"
                          >
                            {person.name}
                          </button>
                          <p className="truncate text-meta text-muted-foreground">{person.email}</p>
                        </div>
                        {person.banned ? <Badge variant="destructive">Suspendida</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadges roles={person.roles} />
                    </TableCell>
                    <TableCell className="max-md:hidden">
                      <span className="flex items-center gap-1.5 text-meta text-subtle">
                        <StatusDot tone={person.owuSlack ? "ok" : "idle"} />
                        {person.owuSlack ? "Sí" : "No"}
                      </span>
                    </TableCell>
                    <TableCell className="font-terminal text-meta text-muted-foreground tabular-nums max-md:hidden">
                      {person.memberships || "—"}
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      {person.lastSeenAt ? (
                        <RelativeTime date={person.lastSeenAt} />
                      ) : (
                        <span className="text-meta text-faint">nunca</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {total > PAGE ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">
              {offset + 1}–{Math.min(offset + PAGE, total)} de {total}
            </span>
            <div className="flex gap-1.5">
              <Button
                disabled={offset === 0 || people.isFetching}
                size="sm"
                variant="outline"
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
              >
                Anteriores
              </Button>
              <Button
                disabled={offset + PAGE >= total || people.isFetching}
                size="sm"
                variant="outline"
                onClick={() => setOffset(offset + PAGE)}
              >
                Siguientes
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <PersonSheet can={can} meId={meId} open={open} userId={shown} onOpenChange={setOpen} />
    </>
  );
}

function accountLabel(account: PersonDetail["accounts"][number]) {
  if (account.provider === "slack") {
    return account.slackTeamId === OWU_SLACK_TEAM_ID ? "Slack de OWU" : "Slack de otro espacio";
  }
  if (account.provider === "telegram") return "Telegram";

  return account.provider;
}

/** One person: roles, accounts, communities, sessions; suspend, sign out, view the site as them. */
function PersonSheet({
  userId,
  open,
  onOpenChange,
  can,
  meId,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  can: Can;
  meId: string;
}) {
  const queryClient = useQueryClient();
  const person = useQuery(orpc.access.users.get.queryOptions({ input: userId ? { userId } : skipToken }));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.access.users.key() });
  const data = person.data;
  const self = userId === meId;
  const [viewing, setViewing] = useState(false);

  const revoke = useMutation(
    orpc.access.users.revokeSessions.mutationOptions({
      onSuccess: ({ revoked }) => {
        toast.success(revoked === 1 ? "Sesión cerrada" : `${revoked} sesiones cerradas`);
        refresh();
      },
      onError: (error) => toast.error("No se pudo cerrar la sesión", error.message),
    })
  );

  const viewAs = async () => {
    if (!userId) return;
    setViewing(true);
    const { error } = await authClient.admin.impersonateUser({ userId });
    if (error) {
      setViewing(false);
      toast.error("No se pudo ver como esta persona", error.message ?? "Probá de nuevo.");
      return;
    }
    window.location.href = "/";
  };

  return (
    <EditorPanel
      actions={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {data && can("user:impersonate") && !self && !data.banned ? (
            <Button disabled={viewing} type="button" variant="outline" onClick={() => void viewAs()}>
              <Eye />
              {viewing ? "Entrando…" : "Ver como esta persona"}
            </Button>
          ) : null}
        </>
      }
      description={data?.email}
      icon={UserRound}
      open={open}
      title={data?.name ?? "Persona"}
      onOpenChange={onOpenChange}
    >
      {person.isError ? (
        <ErrorState retrying={person.isFetching} title="No se pudo cargar" onRetry={() => void person.refetch()} />
      ) : !data ? (
        <div aria-hidden className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <PersonAvatar image={data.image} name={data.name} size={40} />
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <RoleBadges roles={data.roles} />
              {data.banned ? <Badge variant="destructive">Suspendida</Badge> : null}
              {data.owuSlack ? null : <Badge variant="warning">Sin Slack de OWU</Badge>}
              <span className="text-meta text-muted-foreground">
                · desde {day(data.createdAt)}
                {data.lastSeenAt ? (
                  <>
                    {" "}
                    · vista <RelativeTime className="text-meta" date={data.lastSeenAt} />
                  </>
                ) : null}
              </span>
            </div>
          </div>

          <PanelSection title="Roles del sitio">
            {can("user:set-role") && !self ? (
              <RolesEditor key={`${data.id}:${data.roles.join(",")}`} person={data} onSaved={refresh} />
            ) : (
              <p className="text-meta text-muted-foreground">
                {self ? "Tus propios roles los cambia otra persona." : "Solo un superadmin cambia roles."}
              </p>
            )}
          </PanelSection>

          <PanelSection title="Comunidades">
            {data.communities.length === 0 ? (
              <p className="text-meta text-muted-foreground">No está en el equipo de ninguna.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.communities.map((community) => (
                  <li key={community.id} className="flex items-center gap-2 px-3 py-2">
                    <Link
                      className="min-w-0 flex-1 truncate text-ui text-foreground hover:underline"
                      href={`/admin/communities/${community.slug}`}
                    >
                      {community.name}
                    </Link>
                    <Badge variant="secondary">{roleLabel(community.role)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>

          <PanelSection title="Cuentas">
            {data.accounts.length === 0 ? (
              <p className="text-meta text-muted-foreground">Entra con un código por email.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {data.accounts.map((account) => (
                  <li key={`${account.provider}:${account.accountId}`}>
                    <Badge
                      title={account.accountId}
                      variant={account.slackTeamId === OWU_SLACK_TEAM_ID ? "success" : "secondary"}
                    >
                      {accountLabel(account)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>

          <PanelSection
            action={
              can("session:revoke") && data.sessions.length > 1 ? (
                <Button
                  disabled={revoke.isPending}
                  size="sm"
                  variant="outline"
                  onClick={() => revoke.mutate({ userId: data.id })}
                >
                  <LogOut />
                  Cerrar todas
                </Button>
              ) : undefined
            }
            title="Sesiones abiertas"
          >
            {data.sessions.length === 0 ? (
              <p className="text-meta text-muted-foreground">Ninguna.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.sessions.map((session) => (
                  <li key={session.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui text-foreground">
                        {deviceOf(session.userAgent)}
                        {session.impersonatedBy ? (
                          <span className="text-muted-foreground"> · vista por staff</span>
                        ) : null}
                      </p>
                      <p className="truncate text-meta text-muted-foreground">
                        {session.ipAddress ?? "IP desconocida"} · desde{" "}
                        <RelativeTime className="text-meta" date={session.createdAt} />
                      </p>
                    </div>
                    {can("session:revoke") ? (
                      <Button
                        disabled={revoke.isPending}
                        size="sm"
                        variant="ghost"
                        onClick={() => revoke.mutate({ userId: data.id, sessionId: session.id })}
                      >
                        Cerrar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </PanelSection>

          {can("user:ban") && !self ? (
            <PanelSection title="Suspensión">
              <Suspension key={`${data.id}:${String(data.banned)}`} person={data} onDone={refresh} />
            </PanelSection>
          ) : null}
        </div>
      )}
    </EditorPanel>
  );
}

function RolesEditor({ person, onSaved }: { person: PersonDetail; onSaved: () => void }) {
  const held: PlatformRole[] = person.roles.filter(isPlatformRole).filter((role) => role !== "user");
  const [draft, setDraft] = useState<PlatformRole[]>(held);
  const dirty = draft.length !== held.length || draft.some((role) => !held.includes(role));
  const save = useMutation(
    orpc.access.users.setRoles.mutationOptions({
      onSuccess: () => {
        toast.success("Roles guardados", `${person.name} ya tiene los roles nuevos.`);
        onSaved();
      },
      onError: (error) => toast.error("No se pudieron cambiar los roles", error.message),
    })
  );

  return (
    <div className="space-y-2.5">
      <RoleChecklist disabled={save.isPending} id={`roles-${person.id}`} value={draft} onChange={setDraft} />
      {dirty ? (
        <div className="flex justify-end gap-1.5">
          <Button disabled={save.isPending} size="sm" variant="ghost" onClick={() => setDraft(held)}>
            Deshacer
          </Button>
          <Button disabled={save.isPending} size="sm" onClick={() => save.mutate({ userId: person.id, roles: draft })}>
            {save.isPending ? "Guardando…" : "Guardar roles"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Suspension({ person, onDone }: { person: PersonDetail; onDone: () => void }) {
  const [why, setWhy] = useState("");
  const [days, setDays] = useState("");
  const [error, setError] = useState<string>();
  const ban = useMutation(
    orpc.access.users.ban.mutationOptions({
      onSuccess: () => {
        toast.success("Cuenta suspendida", `${person.name} no puede entrar y se cerraron sus sesiones.`);
        onDone();
      },
      onError: (failure) => setError(failure.message),
    })
  );
  const unban = useMutation(
    orpc.access.users.unban.mutationOptions({
      onSuccess: () => {
        toast.success("Cuenta reactivada", `${person.name} puede volver a entrar.`);
        onDone();
      },
      onError: (failure) => toast.error("No se pudo reactivar", failure.message),
    })
  );

  if (person.banned) {
    return (
      <div className="space-y-2.5">
        <Notice tone="warning">
          Suspendida {person.banExpires ? `hasta el ${day(person.banExpires)}` : "hasta que alguien la reactive"}.
          {person.banReason ? <span className="text-muted-foreground"> Motivo: {person.banReason}</span> : null}
        </Notice>
        <Button
          disabled={unban.isPending}
          size="sm"
          variant="outline"
          onClick={() => unban.mutate({ userId: person.id })}
        >
          {unban.isPending ? "Reactivando…" : "Reactivar"}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (why.trim().length < 3) {
          setError("Contá por qué, en pocas palabras");
          return;
        }
        const count = days ? Number(days) : undefined;
        if (count !== undefined && !(Number.isInteger(count) && count >= 1)) {
          setError("Los días van en número entero, o vacío para que no venza");
          return;
        }
        ban.mutate({ userId: person.id, reason: why.trim(), days: count });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          aria-describedby="ban-error"
          aria-invalid={Boolean(error)}
          aria-label="Motivo"
          className="min-w-48 flex-1"
          maxLength={300}
          placeholder="Motivo"
          value={why}
          onChange={(event) => {
            setWhy(event.target.value);
            setError(undefined);
          }}
        />
        <Input
          aria-label="Días (vacío: hasta reactivarla)"
          className="w-28"
          inputMode="numeric"
          min={1}
          placeholder="Días"
          type="number"
          value={days}
          onChange={(event) => {
            setDays(event.target.value);
            setError(undefined);
          }}
        />
        <Button disabled={ban.isPending} type="submit" variant="destructive">
          {ban.isPending ? "Suspendiendo…" : "Suspender"}
        </Button>
      </div>
      <FieldError id="ban-error" message={error} />
      <p className="text-meta text-muted-foreground">
        No puede entrar, y sus sesiones y llaves dejan de andar. Sin días, hasta que alguien la reactive.
      </p>
    </form>
  );
}
