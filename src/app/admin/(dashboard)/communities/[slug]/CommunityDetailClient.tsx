"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, Trash2, UserPlus } from "lucide-react";

import { orpc } from "lib/orpc";
import { cn } from "app/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Empty } from "components/shared/ui/empty";
import { DatePicker } from "components/shared/ui/date-picker";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  member: "Miembro",
};

export default function CommunityDetailClient({ slug }: { slug: string }) {
  const queryClient = useQueryClient();

  const communityQuery = useQuery(orpc.communities.getBySlug.queryOptions({ input: { communitySlug: slug } }));
  const community = communityQuery.data ?? null;

  // General form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (community) {
      setName(community.name);
      setDescription(community.description ?? "");
      setIsActive(community.isActive);
    }
  }, [community]);

  const membersQuery = useQuery(
    orpc.communities.members.list.queryOptions({
      input: { communityId: community?.id ?? "" },
      enabled: Boolean(community),
    })
  );

  const eventsQuery = useQuery(
    orpc.openSpaces.listByCommunity.queryOptions({
      input: { communityId: community?.id ?? "" },
      enabled: Boolean(community),
    })
  );

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.communities.getBySlug.key({ input: { communitySlug: slug } }) }),
      community
        ? queryClient.invalidateQueries({
            queryKey: orpc.communities.members.list.key({ input: { communityId: community.id } }),
          })
        : Promise.resolve(),
      community
        ? queryClient.invalidateQueries({
            queryKey: orpc.openSpaces.listByCommunity.key({ input: { communityId: community.id } }),
          })
        : Promise.resolve(),
    ]);
  }

  const updateMutation = useMutation(
    orpc.communities.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Comunidad actualizada", "Los cambios fueron guardados.");
        await invalidateAll();
      },
      onError: (error) =>
        toast.error("No se pudo guardar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  // Members
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");

  const addMemberMutation = useMutation(
    orpc.communities.members.add.mutationOptions({
      onSuccess: async () => {
        toast.success("Miembro agregado", newMemberEmail);
        setNewMemberEmail("");
        await invalidateAll();
      },
      onError: (error) =>
        toast.error("No se pudo agregar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const updateRoleMutation = useMutation(
    orpc.communities.members.updateRole.mutationOptions({
      onSuccess: invalidateAll,
      onError: (error) =>
        toast.error("No se pudo cambiar el rol", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const removeMemberMutation = useMutation(
    orpc.communities.members.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("Miembro quitado", "");
        await invalidateAll();
      },
      onError: (error) => toast.error("No se pudo quitar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  // Events
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");

  const createEventMutation = useMutation(
    orpc.openSpaces.create.mutationOptions({
      onSuccess: async (event) => {
        toast.success("Evento creado", `"${event.name}" (${event.slug})`);
        setEventDialogOpen(false);
        setEventName("");
        setEventDate("");
        await invalidateAll();
      },
      onError: (error) => toast.error("No se pudo crear", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  function handleCreateEvent() {
    if (!community || !eventDate) return;
    const start = new Date(`${eventDate}T09:00:00`);
    const end = new Date(`${eventDate}T19:00:00`);
    createEventMutation.mutate({
      communityId: community.id,
      name: eventName.trim(),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      isActive: true,
      autoHighlightEnabled: false,
    });
  }

  if (communityQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <Empty description={`No existe la comunidad "${slug}".`} title="Comunidad no encontrada" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-md font-display text-sm font-extrabold",
            community.slug === "owu"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-muted text-foreground"
          )}
        >
          {community.name.slice(0, 3).toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{community.name}</h1>
          <p className="font-terminal text-xs text-muted-foreground">/comunidad/{community.slug}</p>
        </div>
        <Badge className="ml-auto gap-1.5 font-normal" variant="outline">
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 rounded-full", community.isActive ? "bg-emerald-500" : "bg-muted-foreground")}
          />
          {community.isActive ? "Activa" : "Inactiva"}
        </Badge>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Miembros</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de la comunidad</CardTitle>
              <CardDescription>Nombre, descripción y visibilidad</CardDescription>
            </CardHeader>
            <CardContent className="max-w-xl space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre</Label>
                <Input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Descripción</Label>
                <Textarea
                  id="edit-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Comunidad activa</p>
                  <p className="text-xs text-muted-foreground">Las comunidades inactivas no aparecen públicamente.</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <Button
                disabled={updateMutation.isPending || !name.trim()}
                onClick={() =>
                  updateMutation.mutate({
                    communityId: community.id,
                    data: { name: name.trim(), description: description.trim() || null, isActive },
                  })
                }
              >
                {updateMutation.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Miembros</CardTitle>
              <CardDescription>
                Owner administra todo · Admin gestiona miembros y eventos · Editor edita la grilla
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1 space-y-2">
                  <Label htmlFor="member-email">Agregar por email</Label>
                  <Input
                    id="member-email"
                    placeholder="persona@ejemplo.com"
                    type="email"
                    value={newMemberEmail}
                    onChange={(event) => setNewMemberEmail(event.target.value)}
                  />
                </div>
                <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!newMemberEmail.includes("@") || addMemberMutation.isPending}
                  onClick={() =>
                    addMemberMutation.mutate({
                      communityId: community.id,
                      email: newMemberEmail.trim(),
                      role: newMemberRole as "owner" | "admin" | "editor" | "member",
                    })
                  }
                >
                  <UserPlus />
                  Agregar
                </Button>
              </div>

              {membersQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !membersQuery.data || membersQuery.data.length === 0 ? (
                <Empty
                  description="Agregá miembros por email (deben haber iniciado sesión antes)."
                  title="Sin miembros"
                />
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Persona</TableHead>
                        <TableHead className="w-36">Rol</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {membersQuery.data.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={member.image ?? undefined} />
                                <AvatarFallback className="bg-muted text-xs text-foreground">
                                  {member.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={member.role}
                              onValueChange={(role) =>
                                updateRoleMutation.mutate({
                                  communityId: community.id,
                                  memberId: member.id,
                                  role: role as "owner" | "admin" | "editor" | "member",
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              aria-label={`Quitar a ${member.name}`}
                              className="text-muted-foreground hover:text-destructive"
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                removeMemberMutation.mutate({ communityId: community.id, memberId: member.id })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Eventos</CardTitle>
                <CardDescription>Open spaces de la comunidad</CardDescription>
              </div>
              <Button onClick={() => setEventDialogOpen(true)}>
                <CalendarPlus />
                Nuevo evento
              </Button>
            </CardHeader>
            <CardContent>
              {eventsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
                <Empty description="Creá el primer evento de la comunidad." icon={CalendarPlus} title="Sin eventos" />
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventsQuery.data.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <Link
                              className="group block"
                              href={`/admin/communities/${community.slug}/events/${event.slug}`}
                            >
                              <p className="text-sm font-medium text-foreground group-hover:underline">{event.name}</p>
                              <p className="font-terminal text-xs text-muted-foreground">{event.slug}</p>
                            </Link>
                          </TableCell>
                          <TableCell className="font-terminal text-xs tabular-nums text-muted-foreground">
                            {format(new Date(event.startDate), "d MMM yyyy", { locale: es })}
                          </TableCell>
                          <TableCell>
                            <Badge className="gap-1.5 font-normal" variant="outline">
                              <span
                                aria-hidden
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  event.isActive ? "bg-emerald-500" : "bg-muted-foreground"
                                )}
                              />
                              {event.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo evento</DialogTitle>
            <DialogDescription>Después vas a poder configurar salas, bloques y la grilla.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-name">Nombre</Label>
              <Input
                id="event-name"
                placeholder="Open Space 2026"
                value={eventName}
                onChange={(event) => setEventName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-date">Fecha</Label>
              <DatePicker id="event-date" value={eventDate} onChange={setEventDate} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEventDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!eventName.trim() || !eventDate || createEventMutation.isPending}
              onClick={handleCreateEvent}
            >
              {createEventMutation.isPending ? "Creando…" : "Crear evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
