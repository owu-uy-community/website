"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Building2, Plus } from "lucide-react";

import { orpc } from "lib/orpc";
import { cn } from "app/lib/utils";
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
import { Empty } from "components/shared/ui/empty";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export default function CommunitiesClient() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");

  const listInput = { includeInactive: true } as const;
  const { data: communities, isLoading } = useQuery(orpc.communities.list.queryOptions({ input: listInput }));

  const createMutation = useMutation(
    orpc.communities.create.mutationOptions({
      onSuccess: async (community) => {
        toast.success("Comunidad creada", `"${community.name}" está lista.`);
        setCreateOpen(false);
        setName("");
        setSlug("");
        setSlugTouched(false);
        setDescription("");
        await queryClient.invalidateQueries({ queryKey: orpc.communities.list.key({ input: listInput }) });
      },
      onError: (error) => {
        toast.error("No se pudo crear", error instanceof Error ? error.message : "Error inesperado");
      },
    })
  );

  function handleCreate() {
    createMutation.mutate({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Comunidades</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada comunidad tiene sus eventos, miembros y (próximamente) su sitio propio.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Nueva comunidad
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !communities || communities.length === 0 ? (
        <Empty
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Nueva comunidad
            </Button>
          }
          description="Creá la primera comunidad para empezar a organizar eventos."
          icon={Building2}
          title="Sin comunidades"
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comunidad</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {communities.map((community) => (
                <TableRow key={community.id}>
                  <TableCell>
                    <Link className="flex items-center gap-3" href={`/admin/communities/${community.slug}`}>
                      <span
                        className={cn(
                          "flex size-8 items-center justify-center rounded-md font-display text-xs font-extrabold",
                          community.slug === "owu"
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-muted text-foreground"
                        )}
                      >
                        {community.name.slice(0, 3).toUpperCase()}
                      </span>
                      <span className="font-medium text-foreground">{community.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-terminal text-xs text-muted-foreground">
                    /comunidad/{community.slug}
                  </TableCell>
                  <TableCell>
                    <Badge className="gap-1.5 font-normal" variant="outline">
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          community.isActive ? "bg-emerald-500" : "bg-muted-foreground"
                        )}
                      />
                      {community.isActive ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button asChild size="icon" variant="ghost">
                      <Link aria-label={`Abrir ${community.name}`} href={`/admin/communities/${community.slug}`}>
                        <ArrowUpRight />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva comunidad</DialogTitle>
            <DialogDescription>El slug define la URL pública: owu.uy/comunidad/&lt;slug&gt;</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="community-name">Nombre</Label>
              <Input
                id="community-name"
                placeholder="Montevideo JS"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugTouched) setSlug(slugify(event.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="community-slug">Slug</Label>
              <Input
                id="community-slug"
                placeholder="montevideo-js"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="community-description">Descripción (opcional)</Label>
              <Textarea
                id="community-description"
                placeholder="¿De qué se trata la comunidad?"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!name.trim() || slug.length < 3 || createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending ? "Creando…" : "Crear comunidad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
