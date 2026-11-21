"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";

import { ConfirmDialog, FieldError, Notice } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import { parsePermission, permissionsOf, PLATFORM_ROLE_GRANTS } from "lib/authz/catalog";
import { orpc } from "lib/orpc";
import type { ApiKeyRow } from "lib/orpc/access/schemas";

import { actionLabel, resourceLabel, type Can } from "./shared";

/** The server's presets (lib/authz/keys.ts): what each kind of machine may do. */
const PRESETS = [
  {
    value: "owy",
    label: "Owy (el bot)",
    hint: "Actúa por quien le habla, nunca más allá de lo que esa persona puede.",
  },
  { value: "owy-operator", label: "Consola de Owy", hint: "Solo operar a Owy por su canal HTTP." },
  { value: "stream-deck", label: "Stream Deck", hint: "Dispara presets del escenario y maneja OBS." },
  { value: "companion", label: "Owy físico", hint: "Habla y mueve la grilla como el bot, por quien tenga enfrente." },
  { value: "custom", label: "A mano", hint: "Elegí cada permiso." },
] as const;

type Preset = (typeof PRESETS)[number]["value"];

/** A key never holds more than the service role, so that's what "a mano" offers. */
const SERVICE_PERMISSIONS = permissionsOf(PLATFORM_ROLE_GRANTS.service);

const summary = (permissions: ApiKeyRow["permissions"]) => Object.keys(permissions).map(resourceLabel).join(", ");

/** Llaves API: machines' keys (the Owy bot, a Stream Deck, the companion). */
export function ApiKeysTab({ can }: { can: Can }) {
  const queryClient = useQueryClient();
  const keys = useQuery(orpc.access.apiKeys.list.queryOptions());
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const revoke = useMutation(
    orpc.access.apiKeys.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Llave revocada", "Dejó de andar.");
        setRevoking(null);
        void queryClient.invalidateQueries({ queryKey: orpc.access.apiKeys.key() });
      },
      onError: (error) => {
        setRevoking(null);
        toast.error("No se pudo revocar", error.message);
      },
    })
  );

  const rows = keys.data ?? [];
  const owners = [...new Set(rows.map((key) => key.owner.id))];

  return (
    <Panel>
      <PanelHead
        actions={
          can("apiKey:create") ? (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus />
              Nueva llave
            </Button>
          ) : null
        }
        icon={KeyRound}
        meta={rows.length || undefined}
        title="Llaves API"
      />
      {keys.isError ? (
        <ErrorState
          className="m-3"
          retrying={keys.isFetching}
          title="No se pudieron cargar las llaves"
          onRetry={() => void keys.refetch()}
        />
      ) : keys.isPending ? (
        <div aria-hidden className="space-y-2 p-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          description="Cada máquina (Owy, un Stream Deck) entra con su propia llave."
          icon={KeyRound}
          title="Ninguna llave"
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Llave</TableHead>
                <TableHead className="w-44 max-md:hidden">Permisos</TableHead>
                <TableHead className="w-24 max-sm:hidden">Vence</TableHead>
                <TableHead className="w-24 max-sm:hidden">Último uso</TableHead>
                <TableHead className="w-11">
                  <span className="sr-only">Revocar</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="pl-4">
                    <p className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">{key.name ?? "Sin nombre"}</span>
                      {key.start ? (
                        <span className="shrink-0 font-terminal text-meta text-muted-foreground">{key.start}…</span>
                      ) : null}
                      {key.enabled ? null : <Badge variant="secondary">Apagada</Badge>}
                    </p>
                    <p className="truncate text-meta text-muted-foreground">
                      {key.owner.name} · <span className="font-terminal">{key.owner.id}</span>
                    </p>
                  </TableCell>
                  <TableCell
                    className="truncate text-meta text-subtle max-md:hidden"
                    title={permissionsOf(key.permissions).join("\n")}
                  >
                    {summary(key.permissions) || "—"}
                  </TableCell>
                  <TableCell className="max-sm:hidden">
                    {key.expiresAt ? <RelativeTime date={key.expiresAt} /> : <span className="text-faint">nunca</span>}
                  </TableCell>
                  <TableCell className="max-sm:hidden">
                    {key.lastRequest ? (
                      <RelativeTime date={key.lastRequest} />
                    ) : (
                      <span className="text-meta text-faint">nunca</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-2">
                    {can("apiKey:revoke") ? (
                      <Button
                        aria-label={`Revocar ${key.name ?? "la llave"}`}
                        className="text-muted-foreground hover:text-live-foreground"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setRevoking(key)}
                      >
                        <Trash2 />
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
        confirmLabel="Revocar"
        description={`${revoking?.owner.name ?? "La máquina"} deja de poder entrar con ella al instante. No se puede deshacer.`}
        open={revoking !== null}
        pending={revoke.isPending}
        pendingLabel="Revocando…"
        title={`¿Revocar «${revoking?.name ?? "la llave"}»?`}
        onConfirm={() => revoking && revoke.mutate({ keyId: revoking.id })}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      />
      {/* Remounted per opening: the form starts empty and the minted key is gone once closed. */}
      {creating ? <NewKeyDialog owners={owners} onClose={() => setCreating(false)} /> : null}
    </Panel>
  );
}

function NewKeyDialog({ owners, onClose }: { owners: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<Preset>("stream-deck");
  const [custom, setCustom] = useState<string[]>([]);
  const [days, setDays] = useState("365");
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const create = useMutation(
    orpc.access.apiKeys.create.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.access.apiKeys.key() }),
      onError: (failure) => setError(failure.message),
    })
  );
  const minted = create.data;

  const submit = () => {
    const count = Number(days);
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(owner.trim())) {
      return setError("La máquina va como un id corto: minúsculas, números y guiones");
    }
    if (!name.trim()) return setError("Poné un nombre para reconocerla");
    if (preset === "custom" && custom.length === 0) return setError("Elegí al menos un permiso");
    if (!(Number.isInteger(count) && count >= 1 && count <= 730)) return setError("Entre 1 y 730 días");
    const permissions: Record<string, string[]> = {};
    for (const permission of custom) {
      const [resource, action] = parsePermission(permission);
      permissions[resource] = [...(permissions[resource] ?? []), action];
    }
    create.mutate({
      owner: owner.trim(),
      name: name.trim(),
      days: count,
      ...(preset === "custom" ? { permissions } : { preset }),
    });
  };

  const copy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      toast.error("No se pudo copiar", "Seleccioná la llave y copiala a mano.");
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !create.isPending && onClose()}>
      {/* A stray click outside must not throw away a key that is shown only once. */}
      <DialogContent onInteractOutside={(event) => minted && event.preventDefault()}>
        {minted ? (
          <>
            <DialogHeader>
              <DialogTitle>Llave creada</DialogTitle>
              <DialogDescription>
                Pegala en la máquina.{" "}
                {minted.expiresAt
                  ? `Vence el ${format(new Date(minted.expiresAt), "d 'de' MMMM 'de' yyyy", { locale: es })}.`
                  : "No vence."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  aria-label="La llave"
                  className="font-terminal"
                  value={minted.key}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  aria-label="Copiar la llave"
                  size="icon"
                  variant="outline"
                  onClick={() => void copy(minted.key)}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
              <Notice tone="warning">Copiala ahora: no se vuelve a mostrar. Si se pierde, revocala y creá otra.</Notice>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nueva llave</DialogTitle>
              <DialogDescription>
                Para una máquina: el bot, un Stream Deck, el Owy físico. Nunca para una persona.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              id="new-key"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="key-owner">Máquina</Label>
                  <Input
                    autoComplete="off"
                    className="font-terminal"
                    id="key-owner"
                    list="key-owners"
                    placeholder="stream-deck-escenario"
                    value={owner}
                    onChange={(event) => {
                      setOwner(event.target.value.toLowerCase());
                      setError(undefined);
                    }}
                  />
                  <datalist id="key-owners">
                    {owners.map((id) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Nombre</Label>
                  <Input
                    autoComplete="off"
                    id="key-name"
                    maxLength={60}
                    placeholder="Stream Deck del escenario"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError(undefined);
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="key-preset">Qué puede hacer</Label>
                  <Select value={preset} onValueChange={(next) => setPreset(next as Preset)}>
                    <SelectTrigger id="key-preset">
                      <SelectValue>{PRESETS.find((item) => item.value === preset)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-80">
                      {PRESETS.map((item) => (
                        <SelectItem key={item.value} className="items-start py-2" value={item.value}>
                          {item.label}
                          <span className="block text-meta text-muted-foreground">{item.hint}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="key-days">Vence en días</Label>
                  <Input
                    id="key-days"
                    inputMode="numeric"
                    max={730}
                    min={1}
                    type="number"
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                  />
                </div>
              </div>
              {preset === "custom" ? (
                <fieldset className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2.5">
                  <legend className="sr-only">Permisos</legend>
                  {SERVICE_PERMISSIONS.map((permission) => {
                    const [resource, action] = parsePermission(permission);

                    return (
                      <label
                        key={permission}
                        className="flex cursor-pointer items-center gap-2.5 py-1 text-ui"
                        htmlFor={`perm-${permission}`}
                      >
                        <Checkbox
                          checked={custom.includes(permission)}
                          id={`perm-${permission}`}
                          onCheckedChange={(next) =>
                            setCustom((current) =>
                              next === true ? [...current, permission] : current.filter((item) => item !== permission)
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {resourceLabel(resource)} · {actionLabel(resource, action)}
                        </span>
                        <span className="font-terminal text-2xs text-faint">{permission}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
              <FieldError message={error} />
            </form>
            <DialogFooter>
              <Button disabled={create.isPending} variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={create.isPending} form="new-key" type="submit">
                {create.isPending ? "Creando…" : "Crear llave"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
