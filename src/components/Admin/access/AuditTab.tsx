"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronRight, ScrollText, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { orpc } from "lib/orpc";
import type { AuditEntry } from "lib/orpc/access/schemas";

import { useDebounced, type Can } from "./shared";

const LIMIT = 50;

/** Who did it, and how: themselves, through the Owy bot, while viewing as someone, or with a machine's key. */
function Who({ entry }: { entry: AuditEntry }) {
  const actor = entry.actor?.name ?? "Alguien";
  if (entry.via === "impersonation") {
    return (
      <>
        <span className="font-medium text-foreground">{entry.by?.name ?? "Staff"}</span>{" "}
        <span className="text-muted-foreground">como {actor}</span>
      </>
    );
  }

  return (
    <>
      <span className="font-medium text-foreground">{actor}</span>
      {entry.via === "delegated" ? (
        <span className="text-muted-foreground"> vía {entry.by?.name ?? "Owy"}</span>
      ) : entry.via === "api-key" ? (
        <span className="text-muted-foreground"> · llave</span>
      ) : null}
    </>
  );
}

/** Auditoría: the log, newest first, filtered by action, person and community. */
export function AuditTab({ can }: { can: Can }) {
  const [action, setAction] = useState("");
  const actionTerm = useDebounced(action.trim(), 300);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [communityId, setCommunityId] = useState("all");
  const [open, setOpen] = useState<string[]>([]);
  const communities = useQuery(orpc.communities.list.queryOptions({ input: {}, staleTime: 60_000 }));
  const entries = useInfiniteQuery(
    orpc.access.audit.infiniteOptions({
      input: (before: string | undefined) => ({
        action: actionTerm || undefined,
        actorId: person?.id,
        communityId: communityId === "all" ? undefined : communityId,
        before,
        limit: LIMIT,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => (last.length === LIMIT ? last.at(-1)?.createdAt : undefined),
    })
  );
  const rows = entries.data?.pages.flat() ?? [];
  const toggle = (id: string) =>
    setOpen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <Panel>
      <PanelHead icon={ScrollText} title="Auditoría" />
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Input
          aria-label="Acción (empieza con)"
          className="w-44 font-terminal"
          placeholder="user. · tracks."
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        {can("user:list") ? <PersonFilter value={person} onChange={setPerson} /> : null}
        <Select value={communityId} onValueChange={setCommunityId}>
          <SelectTrigger aria-label="Comunidad" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">Todas las comunidades</SelectItem>
            {(communities.data ?? []).map((community) => (
              <SelectItem key={community.id} value={community.id}>
                {community.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entries.isError ? (
        <ErrorState
          className="m-3"
          retrying={entries.isFetching}
          title="No se pudo cargar la auditoría"
          onRetry={() => void entries.refetch()}
        />
      ) : entries.isPending ? (
        <div aria-hidden className="space-y-2 p-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact icon={ScrollText} title="Nada con esos filtros" />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((entry) => {
            const expanded = open.includes(entry.id);

            return (
              <li key={entry.id}>
                <button
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.02] focus-visible:bg-white/[0.03] focus-visible:outline-hidden"
                  type="button"
                  onClick={() => toggle(entry.id)}
                >
                  <PersonAvatar image={entry.actor?.image} name={entry.actor?.name ?? "?"} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui">
                      <Who entry={entry} /> <span className="font-terminal text-meta text-subtle">{entry.action}</span>
                    </span>
                    <span className="block truncate text-meta text-muted-foreground">
                      {entry.targetType ? (
                        <span className="font-terminal">
                          {entry.targetType}
                          {entry.targetId ? `:${entry.targetId}` : ""}
                        </span>
                      ) : null}
                      {entry.targetType && entry.community ? " · " : null}
                      {entry.community?.name}
                    </span>
                  </span>
                  <RelativeTime date={entry.createdAt} />
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-90"
                    )}
                  />
                </button>
                {expanded ? (
                  <pre className="mx-3.5 mb-3 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 font-terminal text-2xs whitespace-pre-wrap text-subtle">
                    {JSON.stringify({ ...entry.data, ...(entry.ip ? { ip: entry.ip } : {}) }, null, 2)}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {entries.hasNextPage ? (
        <div className="flex justify-center border-t border-border p-2.5">
          <Button
            disabled={entries.isFetchingNextPage}
            size="sm"
            variant="outline"
            onClick={() => void entries.fetchNextPage()}
          >
            {entries.isFetchingNextPage ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

/** A person to filter by: search access.users.list, pick one. */
function PersonFilter({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (person: { id: string; name: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 250);
  const people = useQuery(
    orpc.access.users.list.queryOptions({
      input: { q: term, limit: 8, offset: 0 },
      enabled: !value && term.length >= 2,
      staleTime: 30_000,
    })
  );

  if (value) {
    return (
      <span className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-raised pr-0.5 pl-2.5 text-ui text-foreground">
        {value.name}
        <Button aria-label="Sacar el filtro de persona" size="icon-xs" variant="ghost" onClick={() => onChange(null)}>
          <X />
        </Button>
      </span>
    );
  }

  return (
    <div className="relative">
      <Input
        aria-label="Persona"
        autoComplete="off"
        className="w-48"
        placeholder="Persona"
        type="search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      {term.length >= 2 && people.data ? (
        <ul className="absolute top-full left-0 z-20 mt-1 w-64 divide-y divide-border overflow-hidden rounded-lg border border-input bg-popover shadow-overlay">
          {people.data.people.length === 0 ? (
            <li className="px-3 py-2 text-meta text-muted-foreground">Nadie con ese nombre.</li>
          ) : (
            people.data.people.map((person) => (
              <li key={person.id}>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] focus-visible:bg-white/[0.03] focus-visible:outline-hidden"
                  type="button"
                  onClick={() => {
                    onChange({ id: person.id, name: person.name });
                    setQ("");
                  }}
                >
                  <PersonAvatar image={person.image} name={person.name} size={20} />
                  <span className="min-w-0 flex-1 truncate text-ui text-foreground">{person.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
