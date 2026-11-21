"use client";

import { Fragment, useState } from "react";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "app/lib/utils";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import {
  COMMUNITY_ROLE_GRANTS,
  communityStatements,
  PLATFORM_ROLE_GRANTS,
  platformStatements,
  type Grants,
} from "lib/authz/catalog";
import { ROLE_LABELS, roleLabel } from "lib/authz/labels";

import { rolesMatrix } from "./roles-matrix";
import { actionLabel, resourceLabel } from "./shared";

const { user: _none, ...SITE_ROLES } = PLATFORM_ROLE_GRANTS;

/** Roles: who may do what, straight from the permission catalog. Read-only. */
export function RolesTab() {
  return (
    <div className="space-y-5">
      <Matrix
        description="Se dan a personas desde Personas o Invitaciones. Valen en todas las comunidades."
        roles={SITE_ROLES}
        statements={platformStatements}
        title="Roles del sitio"
      />
      <Matrix
        description="Los da cada comunidad a su equipo. Una comunidad puede crear roles propios con parte de estos permisos."
        roles={COMMUNITY_ROLE_GRANTS}
        statements={communityStatements}
        title="Roles de una comunidad"
      />
    </div>
  );
}

function Matrix({
  title,
  description,
  roles,
  statements,
}: {
  title: string;
  description: string;
  roles: Record<string, Grants>;
  statements: Grants;
}) {
  const rows = rolesMatrix(roles, statements);
  const names = Object.keys(roles);
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (resource: string) =>
    setOpen((current) =>
      current.includes(resource) ? current.filter((item) => item !== resource) : [...current, resource]
    );

  return (
    <Panel>
      <PanelHead title={title} />
      <div className="space-y-2 border-b border-border px-3.5 py-2.5">
        <p className="text-meta text-muted-foreground">{description}</p>
        <dl className="grid gap-x-4 gap-y-1 text-meta sm:grid-cols-2">
          {names.map((role) => (
            <div key={role} className="flex gap-1.5">
              <dt className="shrink-0 font-medium text-foreground">{roleLabel(role)}</dt>
              <dd className="text-muted-foreground">{ROLE_LABELS[role]?.hint}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Qué</TableHead>
              {names.map((role) => (
                <TableHead key={role} className="w-24 text-center" title={ROLE_LABELS[role]?.hint}>
                  {roleLabel(role)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const expanded = open.includes(row.resource);

              return (
                <Fragment key={row.resource}>
                  <TableRow className="cursor-pointer" onClick={() => toggle(row.resource)}>
                    <TableCell className="pl-2">
                      <button
                        aria-expanded={expanded}
                        className="flex items-center gap-1.5 rounded-sm text-left text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
                        type="button"
                      >
                        <ChevronRight
                          aria-hidden
                          className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")}
                        />
                        {resourceLabel(row.resource)}
                      </button>
                    </TableCell>
                    {names.map((role) => {
                      const held = row.held[role]?.length ?? 0;

                      return (
                        <TableCell
                          key={role}
                          className={cn(
                            "text-center font-terminal text-meta tabular-nums",
                            held === 0
                              ? "text-faint"
                              : held === row.actions.length
                                ? "text-foreground"
                                : "text-muted-foreground"
                          )}
                        >
                          {held === 0 ? "—" : held === row.actions.length ? "todo" : `${held}/${row.actions.length}`}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {expanded
                    ? row.actions.map((action) => (
                        <TableRow key={action} className="bg-white/[0.015]">
                          <TableCell className="h-9 pl-9 text-meta text-subtle">
                            {actionLabel(row.resource, action)}
                            <span className="ml-1.5 font-terminal text-2xs text-faint">
                              {row.resource}:{action}
                            </span>
                          </TableCell>
                          {names.map((role) => (
                            <TableCell key={role} className="h-9 text-center">
                              {row.held[role]?.includes(action) ? (
                                <Check aria-label="Sí" className="mx-auto size-3.5 text-foreground" />
                              ) : (
                                <span className="text-faint">·</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}
