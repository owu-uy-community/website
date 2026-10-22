"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, PiggyBank, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
import { toast } from "components/shared/ui/toast-utils";
import { montevideoIso } from "lib/community/time";
import { orpc } from "lib/orpc";
import type { Survey } from "lib/orpc/salary-survey/schemas";

const STATUS: Record<Survey["status"], { label: string; dot: string }> = {
  draft: { label: "Borrador", dot: "bg-muted-foreground" },
  open: { label: "Abierta", dot: "bg-yellow-400" },
  closed: { label: "Cerrada", dot: "bg-orange-400" },
  published: { label: "Publicada", dot: "bg-emerald-500" },
};

/** What each status can move to, and how the button says it */
const NEXT: Record<Survey["status"], { status: Survey["status"]; label: string; confirm?: string }[]> = {
  draft: [{ status: "open", label: "Abrir", confirm: "La encuesta va a empezar a recibir respuestas. ¿Abrir?" }],
  open: [{ status: "closed", label: "Cerrar", confirm: "No va a aceptar más respuestas. ¿Cerrar?" }],
  closed: [
    {
      status: "published",
      label: "Publicar resultados",
      confirm: "Los agregados y el dataset quedan públicos. ¿Publicar?",
    },
    { status: "open", label: "Reabrir" },
  ],
  published: [{ status: "closed", label: "Despublicar" }],
};

/** ISO → the value a datetime-local input shows, in Montevideo time (UTC-3, no DST) */
const toLocalInput = (iso: string | null) =>
  iso ? new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 16) : "";

const fromLocalInput = (value: string) => (value ? new Date(montevideoIso(value)).toISOString() : null);

const shortDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-UY", {
        timeZone: "America/Montevideo",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(iso))
    : "Sin fecha";

type Form = { slug: string; title: string; opensAt: string; closesAt: string };

export default function EncuestaClient() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [isNew, setIsNew] = useState(true);

  const { data: surveys, isLoading } = useQuery(orpc.salarySurvey.list.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.salarySurvey.list.key() });
  const fail = (title: string) => (error: unknown) =>
    toast.error(title, error instanceof Error ? error.message : "Error inesperado");

  const upsert = useMutation(
    orpc.salarySurvey.upsert.mutationOptions({
      onSuccess: async (survey) => {
        toast.success("Guardada", `“${survey.title}” está al día.`);
        setForm(null);
        await refresh();
      },
      onError: fail("No se pudo guardar"),
    })
  );

  const setStatus = useMutation(
    orpc.salarySurvey.setStatus.mutationOptions({
      onSuccess: async (survey) => {
        toast.success("Estado actualizado", `${survey.title}: ${STATUS[survey.status].label.toLowerCase()}.`);
        await refresh();
      },
      onError: fail("No se pudo cambiar el estado"),
    })
  );

  const taken = new Set(surveys?.map((survey) => survey.slug));
  const slugTaken = isNew && form !== null && taken.has(form.slug.trim());

  const openNew = () => {
    let year = new Date().getFullYear() + 1;
    while (taken.has(String(year))) year += 1;
    setIsNew(true);
    setForm({ slug: String(year), title: `Encuesta de sueldos ${year}`, opensAt: "", closesAt: "" });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Encuesta de sueldos</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Una edición por año. Acá ves cuántas respuestas hay; las respuestas en sí nunca se muestran una por una.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/encuesta-sueldos" target="_blank">
              Ver página
              <ArrowUpRight />
            </Link>
          </Button>
          <Button onClick={openNew}>
            <Plus />
            Nueva edición
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !surveys?.length ? (
        <Empty
          action={
            <Button onClick={openNew}>
              <Plus />
              Nueva edición
            </Button>
          }
          description="Creala como borrador; nadie la ve hasta que la abras."
          icon={PiggyBank}
          title="Todavía no hay ediciones"
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Edición</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Respuestas</TableHead>
                <TableHead>Fechas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {surveys.map((survey) => (
                <TableRow key={survey.slug}>
                  <TableCell>
                    <span className="font-medium text-foreground">{survey.title}</span>
                    <span className="block font-terminal text-xs text-muted-foreground">{survey.slug}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className="gap-1.5 font-normal" variant="outline">
                      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATUS[survey.status].dot)} />
                      {STATUS[survey.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {new Intl.NumberFormat("es-UY").format(survey.responseCount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {shortDate(survey.opensAt)} → {shortDate(survey.closesAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsNew(false);
                          setForm({
                            slug: survey.slug,
                            title: survey.title,
                            opensAt: toLocalInput(survey.opensAt),
                            closesAt: toLocalInput(survey.closesAt),
                          });
                        }}
                      >
                        Editar
                      </Button>
                      {NEXT[survey.status].map((next) => (
                        <Button
                          key={next.status}
                          disabled={setStatus.isPending}
                          size="sm"
                          variant={next.status === "published" || next.status === "open" ? "default" : "outline"}
                          onClick={() => {
                            if (next.confirm && !window.confirm(next.confirm)) return;
                            setStatus.mutate({ slug: survey.slug, status: next.status });
                          }}
                        >
                          {next.label}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? "Nueva edición" : "Editar edición"}</DialogTitle>
            <DialogDescription>
              Las fechas son hora de Montevideo. Con la fecha de cierre pasada, la encuesta deja de aceptar respuestas
              aunque siga abierta.
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <form
              className="space-y-4"
              id="survey-form"
              onSubmit={(event) => {
                event.preventDefault();
                upsert.mutate({
                  slug: form.slug.trim(),
                  title: form.title.trim(),
                  opensAt: fromLocalInput(form.opensAt),
                  closesAt: fromLocalInput(form.closesAt),
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="survey-slug">Edición</Label>
                <Input
                  disabled={!isNew}
                  id="survey-slug"
                  placeholder="2027"
                  value={form.slug}
                  onChange={(event) => setForm({ ...form, slug: event.target.value })}
                />
                {slugTaken ? (
                  <p className="text-sm text-destructive" role="alert">
                    Ya existe esa edición. Editala desde la tabla.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="survey-title">Título</Label>
                <Input
                  id="survey-title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="survey-opens">Abre</Label>
                  <Input
                    id="survey-opens"
                    type="datetime-local"
                    value={form.opensAt}
                    onChange={(event) => setForm({ ...form, opensAt: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="survey-closes">Cierra</Label>
                  <Input
                    id="survey-closes"
                    type="datetime-local"
                    value={form.closesAt}
                    onChange={(event) => setForm({ ...form, closesAt: event.target.value })}
                  />
                </div>
              </div>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button disabled={upsert.isPending || slugTaken} form="survey-form" type="submit">
              {upsert.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
