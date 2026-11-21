"use client";

import { useState } from "react";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, X } from "lucide-react";

import { ClaimsReview } from "app/admin/(dashboard)/communities/ClaimsReview";
import { Notice, SegmentedTabsList } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Tabs } from "components/shared/ui/tabs";
import { toast } from "components/shared/ui/toast-utils";
import { COMMUNITY_ROLE_GRANTS, type PlatformRole } from "lib/authz/catalog";
import { roleLabel, ROLE_LABELS } from "lib/authz/labels";
import { orpc } from "lib/orpc";
import type { AccessRequest } from "lib/orpc/access/schemas";

import { RoleBadges, RoleChecklist, type Can } from "./shared";

const STATUS = {
  approved: { label: "Aprobado", variant: "success" },
  rejected: { label: "Rechazado", variant: "secondary" },
  cancelled: { label: "Lo retiró", variant: "secondary" },
  pending: { label: "Pendiente", variant: "warning" },
} as const;

/** What a dashboard request may be granted from here: the site roles a person holds. */
const GRANTABLE: PlatformRole[] = ["moderator", "staff", "superadmin"];

/** Until a community's own roles load (or if they can't), the built-ins. */
const BUILT_INS = Object.keys(COMMUNITY_ROLE_GRANTS).map((role) => ({
  role,
  label: roleLabel(role),
  description: ROLE_LABELS[role]?.hint ?? "",
}));

/** Pedidos: the access waitlist, and the requests to organize a directory community. */
export function RequestsTab({ can }: { can: Can }) {
  const queryClient = useQueryClient();
  const requests = useQuery(orpc.access.requests.list.queryOptions({ input: {} }));
  const [approving, setApproving] = useState<AccessRequest | null>(null);
  const [open, setOpen] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.access.requests.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.access.users.key() });
  };
  const reject = useMutation(
    orpc.access.requests.decide.mutationOptions({
      onSuccess: () => {
        toast.success("Pedido rechazado");
        refresh();
      },
      onError: (error) => toast.error("No se pudo rechazar", error.message),
    })
  );

  const all = requests.data ?? [];
  const pending = all.filter((request) => request.status === "pending");
  const decided = all.filter((request) => request.status !== "pending").slice(0, 15);
  const decides = can("claim:decide");

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHead icon={Inbox} meta={pending.length || undefined} title="Pedidos de acceso" />
        {requests.isError ? (
          <ErrorState
            className="m-3"
            retrying={requests.isFetching}
            title="No se pudieron cargar los pedidos"
            onRetry={() => void requests.refetch()}
          />
        ) : requests.isPending ? (
          <div aria-hidden className="space-y-2 p-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <EmptyState compact owy title="Nadie esperando" />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                <PersonAvatar image={request.user.image} name={request.user.name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui text-foreground">
                    <span className="font-medium">{request.user.name}</span>{" "}
                    <span className="text-muted-foreground">· quiere entrar a</span>{" "}
                    <span className="font-medium">{request.community?.name ?? "el panel de OWU"}</span>
                  </p>
                  <p className="truncate text-meta text-muted-foreground">
                    {request.user.email} · <RelativeTime className="text-meta" date={request.createdAt} />
                    {request.message ? ` · «${request.message}»` : ""}
                  </p>
                </div>
                {request.user.owuSlack ? null : <Badge variant="warning">Sin Slack de OWU</Badge>}
                {decides ? (
                  <div className="flex gap-1.5">
                    <Button
                      disabled={reject.isPending}
                      size="sm"
                      variant="outline"
                      onClick={() => reject.mutate({ requestId: request.id, decision: "reject" })}
                    >
                      <X />
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setApproving(request);
                        setOpen(true);
                      }}
                    >
                      <Check />
                      Aprobar…
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ClaimsReview />

      {decided.length > 0 ? (
        <Panel>
          <PanelHead title="Resueltos" />
          <ul className="divide-y divide-border">
            {decided.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                <p className="min-w-0 flex-1 truncate text-ui text-foreground">
                  {request.user.name}{" "}
                  <span className="text-muted-foreground">· {request.community?.name ?? "panel de OWU"}</span>
                </p>
                {request.grantedRole ? <RoleBadges roles={request.grantedRole} /> : null}
                <Badge variant={STATUS[request.status].variant}>{STATUS[request.status].label}</Badge>
                <span className="text-meta text-muted-foreground">
                  {request.decidedBy ? `${request.decidedBy.name} · ` : ""}
                  <RelativeTime className="text-meta" date={request.decidedAt ?? request.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <ApproveDialog
        key={approving?.id}
        canSetRole={can("user:set-role")}
        open={open}
        request={approving}
        onDone={refresh}
        onOpenChange={setOpen}
      />
    </div>
  );
}

function ApproveDialog({
  request,
  open,
  onOpenChange,
  canSetRole,
  onDone,
}: {
  request: AccessRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canSetRole: boolean;
  onDone: () => void;
}) {
  const fixed = request?.community ?? null;
  const [kind, setKind] = useState<"community" | "platform">("community");
  const [communityId, setCommunityId] = useState(fixed?.id ?? "");
  const [role, setRole] = useState("member");
  const [platformRoles, setPlatformRoles] = useState<PlatformRole[]>([]);
  const communities = useQuery(
    orpc.communities.list.queryOptions({ input: {}, enabled: open && !fixed, staleTime: 60_000 })
  );
  const roles = useQuery(
    orpc.communities.roles.list.queryOptions({ input: open && communityId ? { communityId } : skipToken })
  );
  const roleOptions = roles.data ?? BUILT_INS;
  const decide = useMutation(
    orpc.access.requests.decide.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          "Pedido aprobado",
          result.invited
            ? "Queda como invitación hasta que entre con el Slack de OWU."
            : result.grantedRole
              ? `${request?.user.name} ahora es ${roleLabel(result.grantedRole.split(",")[0])}.`
              : undefined
        );
        onDone();
        onOpenChange(false);
      },
      onError: (error) => toast.error("No se pudo aprobar", error.message),
    })
  );

  if (!request) return null;
  const platform = kind === "platform";
  const noSlack = !request.user.owuSlack;
  const ready = platform ? platformRoles.length > 0 && !noSlack : Boolean(communityId && role);

  return (
    <Dialog open={open} onOpenChange={(next) => !decide.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprobar a {request.user.name}</DialogTitle>
          <DialogDescription>
            {fixed
              ? `Entra al equipo de ${fixed.name}. Elegí con qué rol.`
              : "Pidió entrar al panel. Elegí qué acceso darle."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!fixed && canSetRole ? (
            <Tabs value={kind} onValueChange={(next) => setKind(next as "community" | "platform")}>
              <SegmentedTabsList
                items={[
                  { value: "community", label: "Rol en una comunidad" },
                  { value: "platform", label: "Rol del sitio" },
                ]}
                value={kind}
              />
            </Tabs>
          ) : null}

          {platform ? (
            <RoleChecklist id="approve-platform" roles={GRANTABLE} value={platformRoles} onChange={setPlatformRoles} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {fixed ? null : (
                <div className="space-y-1.5">
                  <Label htmlFor="approve-community">Comunidad</Label>
                  <Select
                    value={communityId}
                    onValueChange={(next) => {
                      setCommunityId(next);
                      setRole("member");
                    }}
                  >
                    <SelectTrigger id="approve-community">
                      <SelectValue placeholder={communities.isPending ? "Cargando…" : "Elegí una"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(communities.data ?? []).map((community) => (
                        <SelectItem key={community.id} value={community.id}>
                          {community.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="approve-role">Rol</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="approve-role">
                    <SelectValue>
                      {roleOptions.find((item) => item.role === role)?.label ?? roleLabel(role)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="w-72">
                    {roleOptions.map((item) => (
                      <SelectItem key={item.role} className="items-start py-2" value={item.role}>
                        {item.label}
                        {item.description ? (
                          <span className="block text-meta text-muted-foreground">{item.description}</span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Notice show={noSlack} tone={platform ? "warning" : "info"}>
            {platform
              ? "Todavía no entró con el Slack de OWU, y los roles del sitio lo necesitan: invitala desde Invitaciones."
              : "Todavía no entró con el Slack de OWU: el rol queda como invitación hasta que entre con ese Slack."}
          </Notice>
        </div>

        <DialogFooter>
          <Button disabled={decide.isPending} variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!ready || decide.isPending}
            onClick={() =>
              decide.mutate({
                requestId: request.id,
                decision: "approve",
                grant: platform ? { platformRoles } : { communityId, role },
              })
            }
          >
            {decide.isPending ? "Aprobando…" : "Aprobar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
