"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Plus } from "lucide-react";

import { FieldError } from "components/Admin/panel";
import { CommunityMark } from "components/shared/CommunityMark";
import { PageContainer, PageHeader, Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
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
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

function NewCommunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();

  const create = useMutation(
    orpc.communities.create.mutationOptions({
      onSuccess: (community) => {
        toast.success("Comunidad creada", `${community.name} está lista: sumá a su gente y su primer evento.`);
        void queryClient.invalidateQueries({ queryKey: orpc.communities.listForAdmin.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.communities.list.key() });
        onOpenChange(false);
        router.push(`/admin/communities/${community.slug}`);
      },
      onError: (failure) => setError(reason(failure)),
    })
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva comunidad</DialogTitle>
          <DialogDescription>
            Quien la crea queda como su dueño. Después sumás a su gente y sus eventos.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          id="new-community"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return setError("Poné un nombre");
            if (slug.length < 3) return setError("La dirección necesita al menos 3 letras o números");
            create.mutate({ name: name.trim(), slug, description: description.trim() || undefined });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="community-name">Nombre</Label>
            <Input
              autoComplete="off"
              id="community-name"
              placeholder="Montevideo JS"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-slug">Dirección</Label>
            <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background shadow-edge focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20 sm:h-8 pointer-coarse:h-11">
              <span className="flex items-center border-r border-input bg-raised px-2.5 font-terminal text-meta text-muted-foreground">
                /comunidad/
              </span>
              <input
                autoCapitalize="off"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent px-2.5 font-terminal text-meta text-foreground outline-hidden pointer-coarse:text-base"
                id="community-slug"
                placeholder="montevideo-js"
                spellCheck={false}
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setError(undefined);
                  setSlug(slugify(event.target.value));
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-description">Descripción (opcional)</Label>
            <Textarea
              id="community-description"
              placeholder="¿De qué se trata la comunidad?"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <FieldError message={error} />
        </form>
        <DialogFooter>
          <Button disabled={create.isPending} variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={create.isPending} form="new-community" type="submit">
            {create.isPending ? "Creando…" : "Crear comunidad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CommunitiesClient() {
  const [creating, setCreating] = useState(false);
  const communities = useQuery(orpc.communities.listForAdmin.queryOptions());
  const rows = communities.data ?? [];

  const create = (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      Nueva comunidad
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        actions={create}
        description="Cada comunidad tiene su gente, sus permisos y sus eventos."
        meta={
          communities.data ? (
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">{rows.length}</span>
          ) : null
        }
        title="Comunidades"
      />

      {communities.isError ? (
        <ErrorState
          retrying={communities.isFetching}
          title="No se pudieron cargar las comunidades"
          onRetry={() => void communities.refetch()}
        />
      ) : communities.isPending ? (
        <Panel aria-hidden className="space-y-2 p-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          action={create}
          description="Creá la primera para empezar a organizar sus eventos."
          icon={Building2}
          title="Todavía no hay comunidades"
        />
      ) : (
        <Panel className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Comunidad</TableHead>
                <TableHead className="max-md:hidden">Dirección</TableHead>
                <TableHead className="w-24 text-right">Miembros</TableHead>
                <TableHead className="w-24 text-right max-sm:hidden">Eventos</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((community) => {
                const href = `/admin/communities/${community.slug}`;

                return (
                  // The whole row opens the community; the name is the link for keyboards and readers.
                  <TableRow key={community.id} className="group relative cursor-pointer">
                    <TableCell className="pl-4">
                      <Link
                        className="flex min-w-0 items-center gap-3 after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/70"
                        href={href}
                      >
                        <CommunityMark
                          logoUrl={community.logoUrl}
                          name={community.name}
                          size={28}
                          slug={community.slug}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{community.name}</span>
                          {community.description ? (
                            <span className="block truncate text-meta text-muted-foreground">
                              {community.description}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-terminal text-meta text-muted-foreground max-md:hidden">
                      /comunidad/{community.slug}
                    </TableCell>
                    <TableCell className="text-right font-terminal text-meta text-subtle tabular-nums">
                      {community.memberCount}
                    </TableCell>
                    <TableCell className="text-right font-terminal text-meta text-subtle tabular-nums max-sm:hidden">
                      {community.eventCount}
                    </TableCell>
                    <TableCell>
                      {community.isActive ? (
                        <Badge variant="success">
                          <StatusDot tone="ok" />
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-3">
                      <ChevronRight
                        aria-hidden
                        className="size-4 text-faint transition-colors group-hover:text-muted-foreground"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}

      {creating ? <NewCommunityDialog open onOpenChange={setCreating} /> : null}
    </PageContainer>
  );
}
