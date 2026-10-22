"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FaLinkedin, FaWhatsapp } from "react-icons/fa";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarDays,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  MapPin,
  Rocket,
  Ticket,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog, Notice } from "components/Admin/panel";
import { HeaderActions } from "components/Admin/shell/HeaderActions";
import { KeyHint, useShortcuts } from "components/Admin/shell/shortcuts";
import { MicroLabel, PageContainer, PageHeader } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import { DraftPatchSchema, type DraftPatch, type EditableEvent } from "lib/orpc/events/schemas";
import { ROLE_RANK } from "lib/roles";
import { isStep, issues, STEPS, stepState, UNTITLED, type StepKey } from "lib/organizar/steps";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { usePanel } from "../shell/context";
import {
  StepDatos,
  StepDifusion,
  StepFecha,
  StepInscripcion,
  StepLugar,
  StepRevisar,
  StepTipo,
  type DraftChange,
  type StepProps,
} from "./WizardSteps";

/** What autosave watches and sends; the rest (dates, status, venue) changes through actions. */
const EDITABLE = [
  "name",
  "summary",
  "description",
  "format",
  "topics",
  "mode",
  "placeName",
  "placeAddress",
  "venueMapUrl",
  "onlineUrl",
  "registration",
  "registrationUrl",
  "approval",
  "capacity",
  "waitlist",
  "guestsAllowed",
  "rsvpClosesAt",
  "questions",
  "externalLinks",
] as const satisfies readonly (keyof EditableEvent & keyof DraftPatch)[];

type Editable = (typeof EDITABLE)[number];
type Errors = Partial<Record<keyof EditableEvent, string>>;

const pickEditable = (event: EditableEvent) =>
  Object.fromEntries(EDITABLE.map((key) => [key, event[key]])) as Pick<EditableEvent, Editable>;

/** What changed since the last save, split into what's valid to send and what the person must fix. */
function diff(current: EditableEvent, saved: EditableEvent) {
  const patch: Record<string, unknown> = {};
  const invalid: Errors = {};
  for (const key of EDITABLE) {
    if (JSON.stringify(current[key]) === JSON.stringify(saved[key])) continue;
    const checked = DraftPatchSchema.shape[key].safeParse(current[key]);
    if (checked.success) patch[key] = checked.data;
    else invalid[key] = checked.error.issues[0]?.message ?? "Revisá este campo";
  }

  return { patch: patch as DraftPatch, invalid };
}

const STEP_BODY: Record<Exclude<StepKey, "revisar">, (props: StepProps) => React.ReactNode> = {
  tipo: StepTipo,
  datos: StepDatos,
  fecha: StepFecha,
  espacio: StepLugar,
  inscripcion: StepInscripcion,
  difusion: StepDifusion,
};

/** The event wizard: seven steps, saved as you go, published when nothing required is missing. */
export function EventWizard({
  community,
  eventId,
  today,
}: {
  community: CalendarCommunity;
  eventId: string;
  today: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { current } = usePanel();
  const base = `/organizar/panel/${community.slug}`;
  const input = { communityId: community.id, eventId };

  const event = useQuery(orpc.events.get.queryOptions({ input, refetchOnWindowFocus: false }));
  const [draft, setDraft] = useState<EditableEvent | null>(null);
  const saved = useRef<EditableEvent | null>(null);
  const latest = useRef<EditableEvent | null>(null);
  latest.current = draft;
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error" | "stale">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [published, setPublished] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const inFlight = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    if (event.data && !saved.current) {
      saved.current = event.data;
      setDraft(event.data);
    }
  }, [event.data]);

  const save = useMutation(orpc.events.save.mutationOptions());
  const flush = useCallback(
    async (extra?: DraftPatch): Promise<boolean> => {
      const now = latest.current;
      const last = saved.current;
      if (!now || !last) return false;
      if (inFlight.current) {
        again.current = true;
        return false;
      }
      const { patch, invalid } = diff(now, last);
      setErrors(invalid);
      const full = { ...patch, ...extra };
      if (Object.keys(full).length === 0) return Object.keys(invalid).length === 0;

      inFlight.current = true;
      setStatus("saving");
      try {
        const result = await save.mutateAsync({ ...input, expectedUpdatedAt: last.updatedAt, patch: full });
        saved.current = result;
        setDraft((mine) => (mine ? { ...result, ...pickEditable(mine) } : result));
        setStatus("saved");
        setSavedAt(new Date().toISOString());

        return Object.keys(invalid).length === 0;
      } catch (error) {
        const reason = (error as { data?: { reason?: string } }).data?.reason;
        setStatus(reason === "stale" ? "stale" : "error");
        if (reason !== "stale") toast.error("No se pudo guardar", (error as Error).message);

        return false;
      } finally {
        inFlight.current = false;
        if (again.current) {
          again.current = false;
          void flush();
        }
      }
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- input is rebuilt each render from stable ids
    [save.mutateAsync, community.id, eventId]
  );

  // Autosave: 800 ms after the last change
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => void flush(), 800);

    return () => clearTimeout(timer);
  }, [draft, flush]);

  // Leaving the tab saves what's pending; leaving the page while something isn't saved asks first;
  // moving elsewhere in the panel saves on the way out
  useEffect(() => {
    const unsaved = () =>
      inFlight.current ||
      (latest.current !== null &&
        saved.current !== null &&
        Object.keys(diff(latest.current, saved.current).patch).length > 0);
    const onHide = () => document.visibilityState === "hidden" && void flush();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved()) return;
      void flush();
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  const refresh = useCallback(async () => {
    const { data } = await event.refetch();
    if (!data) return;
    saved.current = data;
    setDraft((mine) => (mine ? { ...data, ...pickEditable(mine) } : data));
  }, [event]);

  const reload = async () => {
    const { data } = await event.refetch();
    if (!data) return;
    saved.current = data;
    setDraft(data);
    setStatus("idle");
  };

  const set = (change: DraftChange) => {
    const { schedule, ...rest } = change;
    setDraft((mine) => (mine ? { ...mine, ...rest } : mine));
    if (schedule)
      void flush({ schedule }).then(
        (ok) => ok && toast.success("Movimos el evento", shortWhen(`${schedule.day}T${schedule.startTime}:00-03:00`))
      );
  };

  const list = draft ? issues(draft) : [];
  const required = list.filter((issue) => issue.level === "required");
  const requested = params.get("paso");
  // Without ?paso=, a fresh draft starts at the beginning and one in progress where something is
  // missing; decided once, so filling a step doesn't move the page from under the person
  const firstStep = useRef<StepKey | null>(null);
  if (draft && !firstStep.current) {
    const fresh = draft.format === null && draft.name === UNTITLED;
    firstStep.current = fresh ? "tipo" : (required[0]?.step ?? "tipo");
  }
  const step: StepKey = isStep(requested) ? requested : (firstStep.current ?? "tipo");
  const index = STEPS.findIndex((item) => item.key === step);
  const go = (key: StepKey) => {
    void flush();
    const next = new URLSearchParams(params.toString());
    next.set("paso", key);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
    document.getElementById("wizard-top")?.scrollIntoView({ block: "start" });
  };

  const publish = useMutation(
    orpc.events.publish.mutationOptions({
      onSuccess: (result) => {
        saved.current = result.event;
        setDraft(result.event);
        setPublished(result.path);
      },
      onError: (error) => toast.error("Todavía no se puede publicar", error.message),
    })
  );
  const cancel = useMutation(
    orpc.events.cancel.mutationOptions({
      onSuccess: (result) => {
        saved.current = result;
        setDraft(result);
        setCancelling(false);
        toast.success("Evento cancelado", "Sigue en la agenda como cancelado.");
      },
      onError: (error) => toast.error("No se pudo cancelar", error.message),
    })
  );

  useShortcuts([
    {
      id: "wizard.next",
      keys: "mod+enter",
      label: "Paso siguiente",
      group: "Evento",
      allowInInputs: true,
      run: (keyboard) => {
        keyboard.preventDefault();
        if (index < STEPS.length - 1) go(STEPS[index + 1].key);
      },
    },
    {
      id: "wizard.save",
      keys: "mod+s",
      label: "Guardar ahora",
      group: "Evento",
      allowInInputs: true,
      run: (keyboard) => {
        keyboard.preventDefault();
        void flush();
      },
    },
  ]);

  if (event.isError) {
    return (
      <PageContainer>
        <ErrorState onRetry={() => void event.refetch()} title="No pudimos abrir el evento" />
      </PageContainer>
    );
  }
  if (!draft) {
    return (
      <PageContainer size="large">
        <Skeleton className="mb-6 h-10 w-80" />
        <Skeleton className="h-96 rounded-lg" />
      </PageContainer>
    );
  }

  const Body = step === "revisar" ? null : STEP_BODY[step];
  const isAdmin = current ? ROLE_RANK[current.role] >= ROLE_RANK.admin : false;
  const statusBadge =
    draft.status === "published" ? (
      <Badge variant="success">Publicado</Badge>
    ) : draft.status === "cancelled" ? (
      <Badge variant="destructive">Cancelado</Badge>
    ) : (
      <Badge variant="secondary">Borrador</Badge>
    );

  return (
    <PageContainer size="large">
      <HeaderActions>
        <span
          aria-live="polite"
          className="flex items-center gap-1.5 font-terminal text-meta text-muted-foreground tabular-nums"
        >
          {status === "saving" ? (
            "Guardando…"
          ) : status === "error" ? (
            <span className="text-live-foreground">No se guardó</span>
          ) : status === "stale" ? (
            <span className="text-warning-foreground">Otra persona editó</span>
          ) : savedAt ? (
            <>
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              Guardado · <RelativeTime className="text-meta" date={savedAt} />
            </>
          ) : null}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/organizar/vista-previa/${draft.id}`} target="_blank">
            <Eye />
            <span className="max-sm:hidden">Vista previa</span>
          </Link>
        </Button>
      </HeaderActions>

      <div id="wizard-top" className="scroll-mt-16" />
      <PageHeader
        description={
          draft.dateChosen ? (
            <span className="font-terminal tabular-nums">{shortWhen(draft.startDate)}</span>
          ) : (
            "Sin fecha todavía"
          )
        }
        meta={statusBadge}
        title={draft.name === UNTITLED ? "Evento nuevo" : draft.name}
      />

      <Notice show={status === "stale"} tone="warning">
        <span className="flex flex-wrap items-center justify-between gap-2">
          Otra persona guardó cambios en este evento. Recargá para verlos (lo que escribiste desde entonces se pierde).
          <Button size="xs" variant="outline" onClick={() => void reload()}>
            Recargar
          </Button>
        </span>
      </Notice>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 min-[1400px]:grid-cols-[176px_minmax(0,1fr)_300px] lg:grid-cols-[176px_minmax(0,1fr)]">
        <nav aria-label="Pasos" className="lg:sticky lg:top-4 lg:self-start">
          <MicroLabel className="mb-2 max-lg:hidden">Pasos</MicroLabel>
          <ol className="flex [scrollbar-width:none] gap-1 overflow-x-auto lg:flex-col">
            {STEPS.map((item, at) => {
              const state =
                item.key === "revisar" ? (required.length ? "required" : "done") : stepState(item.key, list);

              return (
                <li key={item.key} className="shrink-0">
                  <button
                    aria-current={item.key === step ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui transition-colors",
                      item.key === step
                        ? "bg-raised font-medium text-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]"
                        : "text-muted-foreground hover:bg-raised/60 hover:text-foreground"
                    )}
                    type="button"
                    onClick={() => go(item.key)}
                  >
                    <span className="font-terminal text-2xs text-faint tabular-nums">{at + 1}</span>
                    <span className="flex-1 whitespace-nowrap">{item.title}</span>
                    {state === "done" ? (
                      <Check aria-label="Listo" className="size-3.5 text-success" />
                    ) : state === "required" ? (
                      <CircleAlert aria-label="Falta algo" className="size-3.5 text-live" />
                    ) : (
                      <span aria-label="Con sugerencias" className="size-1.5 rounded-full bg-warning" />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {Body ? (
            <Body
              community={community}
              draft={draft}
              errors={errors}
              refresh={() => void refresh()}
              set={set}
              today={today}
            />
          ) : (
            <StepRevisar draft={draft} list={list} onGo={go} />
          )}

          <div className="sticky bottom-[calc(var(--admin-tabbar-h,0px)+0.5rem)] z-10 flex items-center justify-between gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-edge backdrop-blur">
            <Button disabled={index === 0} variant="outline" onClick={() => go(STEPS[index - 1].key)}>
              <ArrowLeft />
              Atrás
            </Button>
            <div className="flex items-center gap-2">
              {draft.status === "published" && isAdmin ? (
                <Button variant="ghost" onClick={() => setCancelling(true)}>
                  <Ban />
                  <span className="max-sm:hidden">Cancelar evento</span>
                </Button>
              ) : null}
              {step !== "revisar" ? (
                <Button onClick={() => go(STEPS[index + 1].key)}>
                  Siguiente
                  <ArrowRight />
                  <KeyHint keys="mod+enter" />
                </Button>
              ) : draft.status === "draft" ? (
                <Button
                  disabled={publish.isPending || required.length > 0}
                  onClick={() => void flush().then((ok) => ok && publish.mutate(input))}
                >
                  <Rocket />
                  Publicar
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <a href={`/comunidad/${community.slug}/events/${draft.slug}`} rel="noreferrer" target="_blank">
                    <ExternalLink />
                    Ver la página
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        <aside
          aria-label="Cómo se ve"
          className="hidden min-[1400px]:sticky min-[1400px]:top-4 min-[1400px]:block min-[1400px]:self-start"
        >
          <MicroLabel className="mb-2">Cómo se ve</MicroLabel>
          <Preview community={community} draft={draft} />
        </aside>
      </div>

      <ShareDialog path={published} onClose={() => setPublished(null)} name={draft.name} />
      <ConfirmDialog
        confirmLabel="Cancelar el evento"
        description="Queda en la agenda como cancelado y quienes se anotaron reciben un aviso."
        open={cancelling}
        pending={cancel.isPending}
        pendingLabel="Cancelando…"
        title={`¿Cancelar «${draft.name}»?`}
        onConfirm={() => cancel.mutate({ ...input, reason: "" })}
        onOpenChange={setCancelling}
      />
    </PageContainer>
  );
}

/** The event as attendees will see it, in miniature (the public site's look, not the panel's) */
function Preview({ draft, community }: { draft: EditableEvent; community: CalendarCommunity }) {
  const place =
    draft.mode === "online"
      ? "Online"
      : (draft.venue?.name ?? draft.placeName ?? "Lugar a confirmar") + (draft.mode === "hibrido" ? " · y online" : "");
  const cta = { owu: "Anotarme", external: "Inscribirme", none: "Entrada libre" }[draft.registration];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-5 font-sans">
      <p className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
        {community.name}
        {draft.format ? ` · ${draft.format.replace("-", " ")}` : ""}
      </p>
      <p className="mt-2 font-title text-xl leading-tight font-semibold text-white">
        {draft.name === UNTITLED ? "Nombre del evento" : draft.name}
      </p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-400">
        {draft.summary || "Una línea que lo resuma aparece acá."}
      </p>
      <ul className="mt-4 flex flex-col gap-1.5 text-sm text-zinc-300">
        <li className="flex items-center gap-2">
          <CalendarDays aria-hidden className="size-4 text-zinc-500" />
          {draft.dateChosen ? shortWhen(draft.startDate) : "Fecha a confirmar"}
        </li>
        <li className="flex items-center gap-2">
          <MapPin aria-hidden className="size-4 text-zinc-500" />
          {place}
        </li>
        {draft.registration === "owu" && draft.capacity ? (
          <li className="flex items-center gap-2">
            <Ticket aria-hidden className="size-4 text-zinc-500" />
            {draft.capacity} lugares
          </li>
        ) : null}
      </ul>
      <span
        className={cn(
          "mt-5 flex h-10 items-center justify-center rounded-xl text-sm font-semibold",
          draft.registration === "none" ? "border border-white/10 text-zinc-300" : "bg-yellow-400 text-zinc-950"
        )}
      >
        {cta}
      </span>
    </div>
  );
}

/** Right after publishing: the link, ready to share. */
function ShareDialog({ path, name, onClose }: { path: string | null; name: string; onClose: () => void }) {
  const url = path && typeof window !== "undefined" ? `${window.location.origin}${path}` : "";
  const text = `${name} ${url}`;

  return (
    <Dialog open={path !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¡Publicado!</DialogTitle>
          <DialogDescription>Ya está en la agenda de owu.uy. Compartilo donde está tu gente.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-raised/50 px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-terminal text-meta text-foreground">{url}</span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"))}
          >
            <Copy />
            Copiar
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} rel="noreferrer" target="_blank">
              <FaWhatsapp aria-hidden />
              WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
              rel="noreferrer"
              target="_blank"
            >
              <FaLinkedin aria-hidden />
              LinkedIn
            </a>
          </Button>
        </div>
        <Button asChild>
          <a href={path ?? "#"} rel="noreferrer" target="_blank">
            <ExternalLink />
            Ver la página
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
