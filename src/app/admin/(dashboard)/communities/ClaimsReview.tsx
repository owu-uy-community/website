"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Flag, X } from "lucide-react";

import { Panel, PanelHead } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import { ROLE_LABEL } from "components/organizar/shell/nav";
import { orpc } from "lib/orpc/client";

const RELATION = { organizo: "La organiza", coorganizo: "Coorganiza", retomar: "Quiere retomarla" } as const;

/** People asking to organize a directory community. Approving adds them: owner if it has none yet. */
export function ClaimsReview() {
  const queryClient = useQueryClient();
  const claims = useQuery(orpc.communities.claims.list.queryOptions());
  const decide = useMutation(
    orpc.communities.claims.decide.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.status === "approved"
            ? `Aprobado como ${ROLE_LABEL[result.role ?? "editor"].toLowerCase()}`
            : "Pedido rechazado"
        );
        void queryClient.invalidateQueries({ queryKey: orpc.communities.key() });
      },
      onError: (error) => toast.error("No se pudo resolver el pedido", error.message),
    })
  );
  const pending = (claims.data ?? []).filter((claim) => claim.status === "pending");
  if (pending.length === 0) return null;

  return (
    <Panel className="mb-5">
      <PanelHead icon={Flag} meta={pending.length} title="Pedidos para organizar" />
      <ul className="divide-y divide-border">
        {pending.map((claim) => (
          <li key={claim.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
            <PersonAvatar image={claim.user.image} name={claim.user.name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-ui text-foreground">
                <span className="font-medium">{claim.user.name}</span>{" "}
                <span className="text-muted-foreground">· {RELATION[claim.relation]}</span>{" "}
                <span className="font-medium">{claim.community.name}</span>
              </p>
              <p className="truncate text-meta text-muted-foreground">
                {claim.user.email} · <RelativeTime className="text-meta" date={claim.createdAt} />
                {claim.message ? ` · «${claim.message}»` : ""}
              </p>
            </div>
            {claim.community.hasOwner ? (
              <Badge variant="secondary">Ya tiene dueño</Badge>
            ) : (
              <Badge variant="info">Sin dueño</Badge>
            )}
            {claim.link ? (
              <Button asChild size="icon-sm" variant="ghost">
                <a aria-label="Ver el link que mandó" href={claim.link} rel="noreferrer" target="_blank">
                  <ExternalLink />
                </a>
              </Button>
            ) : null}
            <div className="flex gap-1.5">
              <Button
                disabled={decide.isPending}
                size="sm"
                variant="outline"
                onClick={() => decide.mutate({ claimId: claim.id, decision: "reject" })}
              >
                <X />
                Rechazar
              </Button>
              <Button
                disabled={decide.isPending}
                size="sm"
                onClick={() => decide.mutate({ claimId: claim.id, decision: "approve" })}
              >
                <Check />
                Aprobar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
