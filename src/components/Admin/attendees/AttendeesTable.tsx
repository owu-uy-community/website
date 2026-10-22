"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  functionalUpdate,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Copy,
  Download,
  SearchX,
  Tag,
  Ticket,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog } from "components/Admin/panel";
import { KeyHint, useShortcuts } from "components/Admin/shell/shortcuts";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock, RelativeTime } from "components/Admin/ui/time";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
import { Input } from "components/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { Attendee, AttendeeSort } from "lib/orpc/attendees/schemas";

import { doorOf, downloadCsv } from "./helpers";

const features = tableFeatures({ rowSelectionFeature });
const column = createColumnHelper<typeof features, Attendee>();

/** Ticket classes are free text in Eventbrite; the usual ones get a color. */
function ticketVariant(ticketClass: string): BadgeProps["variant"] {
  if (/estudiant/i.test(ticketClass)) return "info";
  if (/speaker|orador|charla/i.test(ticketClass)) return "success";
  if (/sponsor|patrocin/i.test(ticketClass)) return "default";
  return "secondary";
}

/** A check-in that shouldn't have happened: back to «Por llegar», after a confirmation. */
function UndoCheckin({ attendee, eventId }: { attendee: Attendee; eventId: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const undo = useMutation(
    orpc.attendees.undoCheckin.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        toast.success("Acreditación deshecha", `${attendee.name} vuelve a estar por llegar.`);
        return queryClient.invalidateQueries({ queryKey: orpc.attendees.key() });
      },
      onError: (error) => {
        setConfirming(false);
        toast.error("No se pudo deshacer", error.message);
      },
    })
  );

  return (
    <>
      <Button
        aria-label={`Deshacer la acreditación de ${attendee.name}`}
        className="size-7 shrink-0 text-muted-foreground pointer-coarse:size-9"
        size="icon"
        title="Deshacer la acreditación"
        variant="ghost"
        onClick={() => setConfirming(true)}
      >
        <Undo2 />
      </Button>
      <ConfirmDialog
        confirmLabel="Deshacer"
        description="Vuelve a «Por llegar», también para los sorteos. El escaneo queda en el historial, y una sincronización con Eventbrite no la vuelve a acreditar."
        open={confirming}
        pending={undo.isPending}
        pendingLabel="Deshaciendo…"
        title={`¿Deshacer la acreditación de ${attendee.name}?`}
        onConfirm={() => undo.mutate({ eventId, attendeeId: attendee.id })}
        onOpenChange={setConfirming}
      />
    </>
  );
}

function Presence({ attendee, timezone, eventId }: { attendee: Attendee; timezone: string; eventId: string }) {
  if (attendee.checkedInAt) {
    const repeated = attendee.repeatScans > 0;
    return (
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-2">
            <StatusDot tone={repeated ? "warn" : "ok"} />
            <span className={repeated ? "text-warning-foreground" : "text-foreground"}>
              {repeated ? `Escaneada ${attendee.repeatScans + 1} veces` : "Acreditado"}
            </span>
          </p>
          <p className="truncate pl-3.5 font-terminal text-2xs text-muted-foreground tabular-nums">
            {formatClock(new Date(attendee.checkedInAt), timezone)} · {doorOf(attendee)}
          </p>
        </div>
        <UndoCheckin attendee={attendee} eventId={eventId} />
      </div>
    );
  }
  if (attendee.status !== "attending") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CircleX aria-hidden className="size-3.5" />
        {attendee.status === "refunded" ? "Reembolsada" : "Cancelada"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full border border-muted-foreground" />
      Por llegar
    </span>
  );
}

function SortButton({
  label,
  by,
  sort,
  onSort,
}: {
  label: string;
  by: "name" | "checkin" | "registered";
  sort: AttendeeSort;
  onSort: (sort: AttendeeSort) => void;
}) {
  const active = sort === by || sort === `-${by}`;
  const reversed = sort === `-${by}`;
  // Names start A→Z (ascending), times newest first (descending); the arrow says which way it runs.
  const ascending = by === "name" ? !reversed : reversed;
  const Arrow = ascending ? ArrowUp : ArrowDown;

  return (
    <button
      className={cn(
        "relative -mx-1 inline-flex h-7 items-center gap-1 rounded-sm px-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2",
        active && "text-foreground"
      )}
      type="button"
      onClick={() => onSort((active && !reversed ? `-${by}` : by) as AttendeeSort)}
    >
      {label}
      {active ? <Arrow aria-hidden className="size-3" /> : null}
      <span className="sr-only">{active ? (reversed ? "(orden inverso)" : "(ordenado)") : "(ordenar)"}</span>
    </button>
  );
}

/** Tags on the selection, with how many of them have each; a click puts it on all of them, or takes it off all. */
function TagMenu({
  eventId,
  selected,
  tags,
  onDone,
}: {
  eventId: string;
  selected: Attendee[];
  tags: string[];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState("");
  // A tag just taken off everyone stays listed while the menu is open, so it can go back on with a tap.
  const [listed, setListed] = useState<string[]>([]);
  const setTags = useMutation(
    orpc.attendees.setTags.mutationOptions({
      onError: (error) => toast.error("No se pudieron cambiar las etiquetas", error.message),
    })
  );
  const ids = selected.map((attendee) => attendee.id);
  const known = [...new Set([...listed, ...tags, ...selected.flatMap((attendee) => attendee.tags)])].toSorted((a, b) =>
    a.localeCompare(b, "es")
  );
  if (known.length !== listed.length) setListed(known);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const tag = draft.trim();
    if (!tag) return;
    setTags.mutate({ eventId, ids, add: [tag], remove: [] }, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={add}>
        <Input
          aria-label="Nueva etiqueta"
          maxLength={32}
          placeholder="Nueva etiqueta…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button disabled={!draft.trim() || setTags.isPending} size="sm" type="submit" variant="outline">
          Agregar
        </Button>
      </form>
      {known.length > 0 ? (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto">
          {known.map((tag) => {
            const having = selected.filter((attendee) => attendee.tags.includes(tag)).length;
            const all = having === selected.length;
            return (
              <li key={tag}>
                <label className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-ui hover:bg-raised pointer-coarse:h-11">
                  <Checkbox
                    checked={all || (having > 0 && "indeterminate")}
                    disabled={setTags.isPending}
                    onCheckedChange={() =>
                      setTags.mutate(
                        all ? { eventId, ids, add: [], remove: [tag] } : { eventId, ids, add: [tag], remove: [] }
                      )
                    }
                  />
                  <span className="truncate">{tag}</span>
                  <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">
                    {having}/{selected.length}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Button className="w-full" size="sm" variant="ghost" onClick={onDone}>
        Listo
      </Button>
    </div>
  );
}

const EMPTY: Attendee[] = [];

/**
 * One page of attendees (the server filters, sorts and pages over all of them). Selection
 * survives paging; the bar that floats over the table acts on everyone selected.
 */
export function AttendeesTable({
  eventId,
  timezone,
  rows,
  loading,
  error,
  onRetry,
  total,
  page,
  pageSize,
  onPage,
  sort,
  onSort,
  tags,
  empty,
}: {
  eventId: string;
  timezone: string;
  rows: Attendee[] | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Rows the filters match, over every page. */
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  sort: AttendeeSort;
  onSort: (sort: AttendeeSort) => void;
  /** Every tag in use, for the tag menu. */
  tags: string[];
  /** What to say when nothing matches. */
  empty: ReactNode;
}) {
  const data = rows ?? EMPTY;
  const [selected, setSelected] = useState<Map<string, Attendee>>(() => new Map());
  const [tagging, setTagging] = useState(false);
  const fresh = useMemo(() => new Map(data.map((row) => [row.id, row])), [data]);
  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries([...selected.keys()].map((id) => [id, true])),
    [selected]
  );
  const chosen = [...selected.keys()].flatMap((id) => {
    const attendee = fresh.get(id) ?? selected.get(id);
    return attendee ? [attendee] : [];
  });

  const exportSelection = useMutation(
    orpc.attendees.export.mutationOptions({
      onSuccess: downloadCsv,
      onError: (failure) => toast.error("No se pudo exportar", failure.message),
    })
  );

  const columns = useMemo(
    () =>
      column.columns([
        column.display({
          id: "select",
          header: ({ table }) => (
            <Checkbox
              aria-label="Elegir a todos los de esta página"
              checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Elegir a ${row.original.name}`}
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(value === true)}
            />
          ),
        }),
        column.accessor("name", {
          header: () => <SortButton by="name" label="Nombre" sort={sort} onSort={onSort} />,
          cell: ({ row }) => (
            <div className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar className="max-sm:hidden" name={row.original.name} size={28} />
              <div className="min-w-0 leading-tight">
                <p className="truncate font-medium text-foreground">{row.original.name}</p>
                <p className="truncate text-meta text-muted-foreground">{row.original.email || "Sin email"}</p>
              </div>
            </div>
          ),
        }),
        column.accessor("ticketClass", {
          header: "Entrada",
          cell: ({ getValue }) =>
            getValue() ? (
              <Badge className="max-w-40 truncate" variant={ticketVariant(getValue())}>
                {getValue()}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
        column.accessor("checkedInAt", {
          header: () => <SortButton by="checkin" label="Estado" sort={sort} onSort={onSort} />,
          cell: ({ row }) => <Presence attendee={row.original} eventId={eventId} timezone={timezone} />,
        }),
        column.accessor("tags", {
          header: "Etiquetas",
          cell: ({ getValue }) => {
            const list = getValue();
            return list.length ? (
              // Long tags wrap inside the column rather than run over the next one.
              <span className="flex flex-wrap items-center gap-1">
                {list.slice(0, 2).map((tag) => (
                  <Badge key={tag} className="max-w-24 truncate" variant="outline">
                    {tag}
                  </Badge>
                ))}
                {list.length > 2 ? (
                  // A tap lists the rest: a touchscreen never shows a title.
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        aria-label={`${list.length - 2} etiquetas más`}
                        className="touch-target rounded-sm font-terminal text-meta text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
                        title={list.slice(2).join(", ")}
                        type="button"
                      >
                        +{list.length - 2}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="flex w-auto max-w-64 flex-wrap gap-1 p-2">
                      {list.slice(2).map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </PopoverContent>
                  </Popover>
                ) : null}
              </span>
            ) : null;
          },
        }),
        column.accessor("registeredAt", {
          header: () => <SortButton by="registered" label="Registro" sort={sort} onSort={onSort} />,
          cell: ({ getValue }) => {
            const at = getValue();
            return at ? <RelativeTime date={at} /> : <span className="text-muted-foreground">—</span>;
          },
        }),
      ]),
    [sort, onSort, timezone, eventId]
  );

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next = functionalUpdate(updater, rowSelection);
      setSelected(
        (previous) =>
          new Map(
            Object.keys(next).flatMap((id) => {
              const attendee = next[id] ? (previous.get(id) ?? fresh.get(id)) : undefined;
              return attendee ? [[id, attendee] as const] : [];
            })
          )
      );
    },
  });

  const clear = () => {
    setSelected(new Map());
    setTagging(false);
  };
  useShortcuts(
    selected.size > 0
      ? [
          {
            id: "attendees.clear-selection",
            keys: "escape",
            label: "Limpiar la selección",
            group: "Asistentes",
            run: clear,
          },
        ]
      : []
  );

  const copyEmails = async () => {
    const emails = chosen.map((attendee) => attendee.email).filter(Boolean);
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(emails.length === 1 ? "Copiamos 1 email" : `Copiamos ${emails.length} emails`);
    } catch {
      toast.error("No se pudo copiar", "El navegador no dejó usar el portapapeles.");
    }
  };

  // Columns come in as the table gets wider, not the window: with the sidebar open (and the aside beside it) a
  // tablet or a small laptop leaves the table a phone's width, and names come first.
  const CELL: Record<string, string> = {
    select: "w-10",
    name: "w-[58%] min-w-0 @md:w-[42%] @2xl:w-[36%] @3xl:w-[30%]",
    ticketClass: "w-28 @max-md:hidden",
    checkedInAt: "min-w-0",
    tags: "w-[13%] @max-3xl:hidden",
    registeredAt: "w-24 @max-2xl:hidden",
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="relative">
      <div className="@container overflow-clip rounded-lg border border-border bg-card shadow-edge">
        <Table className="table-fixed">
          <TableHeader className="max-md:top-[calc(46px+env(safe-area-inset-top))]">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={CELL[header.column.id]}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading && !rows ? (
              Array.from({ length: 8 }, (_, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className={CELL.select}>
                    <Skeleton className="size-[15px] rounded-[4px]" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="size-7 rounded-full max-sm:hidden" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-3 w-44" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={CELL.ticketClass}>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3.5 w-40" />
                  </TableCell>
                  <TableCell className={CELL.tags} />
                  <TableCell className={CELL.registeredAt}>
                    <Skeleton className="h-3.5 w-16" />
                  </TableCell>
                </TableRow>
              ))
            ) : error && !rows ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="h-auto p-4" colSpan={6}>
                  <ErrorState description={error.message} title="No se pudo cargar la lista" onRetry={onRetry} />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="h-auto" colSpan={6}>
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(loading && "opacity-60", "data-[state=selected]:bg-primary/[0.04]")}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("h-[52px]", CELL[cell.column.id])}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {total > 0 ? (
          <div className="flex h-11 items-center justify-between gap-3 border-t border-border px-3.5">
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">
              {from}–{to} de {total}
            </span>
            <div className="flex items-center gap-1">
              <span className="mr-1 font-terminal text-meta text-muted-foreground tabular-nums max-sm:hidden">
                Página {page} de {pages}
              </span>
              <Button
                aria-label="Página anterior"
                disabled={page <= 1}
                size="icon-sm"
                variant="ghost"
                onClick={() => onPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label="Página siguiente"
                disabled={page >= pages}
                size="icon-sm"
                variant="ghost"
                onClick={() => onPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {selected.size > 0 ? (
        // On phones it floats above the shell's tab bar (56px and the home indicator).
        <div className="pointer-events-none sticky bottom-4 z-30 h-0 max-md:bottom-[calc(52px+env(safe-area-inset-bottom))]">
          <div
            aria-label="Acciones sobre la selección"
            className="pointer-events-auto absolute bottom-3 left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-xl border border-input bg-popover p-1.5 pl-3 shadow-overlay"
            role="toolbar"
          >
            <span className="mr-1.5 text-ui whitespace-nowrap">
              <span className="font-terminal text-primary tabular-nums">{selected.size}</span>
              <span className="max-sm:sr-only"> {selected.size === 1 ? "seleccionado" : "seleccionados"}</span>
            </span>
            <Popover open={tagging} onOpenChange={setTagging}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <Tag />
                  <span className="max-sm:sr-only">Etiquetar</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-72" side="top" sideOffset={10}>
                <TagMenu eventId={eventId} selected={chosen} tags={tags} onDone={() => setTagging(false)} />
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="outline" onClick={() => void copyEmails()}>
              <Copy />
              <span className="max-sm:sr-only">Copiar emails</span>
            </Button>
            <Button
              disabled={exportSelection.isPending}
              size="sm"
              variant="outline"
              onClick={() => exportSelection.mutate({ eventId, ids: [...selected.keys()] })}
            >
              <Download />
              <span className="max-sm:sr-only">Exportar</span>
            </Button>
            <span aria-hidden className="mx-1 h-4 w-px bg-input max-sm:hidden" />
            <span className="flex items-center gap-1.5 pr-1 text-meta whitespace-nowrap text-muted-foreground max-md:hidden">
              <KeyHint keys="escape" /> para limpiar
            </span>
            <Button aria-label="Limpiar la selección" size="icon-sm" variant="ghost" onClick={clear}>
              <X />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** What the table says when nothing matches: no entries yet, or filters that leave nobody. */
export function NoAttendees({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return filtered ? (
    <EmptyState
      compact
      action={
        <Button size="sm" variant="outline" onClick={onClear}>
          Limpiar filtros
        </Button>
      }
      description="Probá con otro nombre o sacá algún filtro."
      icon={SearchX}
      title="Nadie coincide"
    />
  ) : (
    <EmptyState
      compact
      description="Cuando alguien saque su entrada en Eventbrite aparece acá (tarda hasta 30 s)."
      icon={Ticket}
      title="Todavía no hay entradas"
    />
  );
}
