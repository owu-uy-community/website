"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpRight, Newspaper, X } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "app/lib/utils";
import { RichText } from "components/shared/RichText";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Empty } from "components/shared/ui/empty";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Skeleton } from "components/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { SemanarioIssue, SemanarioSections } from "lib/orpc/semanario/schemas";

const dateFormat = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", day: "numeric", month: "short" });
const weekLabel = (weekStart: string) => `Semana del ${dateFormat.format(new Date(`${weekStart}T12:00:00Z`))}`;
const shortDate = (iso: string) => dateFormat.format(new Date(iso));

/** Move item `index` one place up (-1) or down (+1) */
function move<T>(items: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];

  return next;
}

function RowActions({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        aria-label="Subir"
        className="size-8"
        disabled={index === 0}
        size="icon"
        variant="ghost"
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        aria-label="Bajar"
        className="size-8"
        disabled={index === count - 1}
        size="icon"
        variant="ghost"
        onClick={() => onMove(1)}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        aria-label="Sacar"
        className="size-8 text-muted-foreground hover:text-destructive"
        size="icon"
        variant="ghost"
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function Preview({ title, intro, sections }: { title: string; intro: string; sections: SemanarioSections }) {
  return (
    <article className="space-y-6 rounded-lg border border-border bg-zinc-950 p-6 text-zinc-300">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h2>
      {intro ? (
        <div className="space-y-3 leading-relaxed [&_a]:underline [&_strong]:text-zinc-50">
          <RichText content={intro} />
        </div>
      ) : null}
      {sections.threads.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-terminal text-xs tracking-widest text-zinc-500 uppercase">Hilos destacados</h3>
          {sections.threads.map((thread) => (
            <p key={thread.permalink}>
              <span className="font-terminal text-xs text-zinc-500">#{thread.channel}</span> {thread.title}{" "}
              <span className="text-xs text-zinc-500">· {thread.replies} respuestas</span>
            </p>
          ))}
        </section>
      ) : null}
      {sections.events.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-terminal text-xs tracking-widest text-zinc-500 uppercase">Agenda</h3>
          {sections.events.map((event) => (
            <p key={event.url}>
              <span className="font-terminal text-xs text-yellow-400">{shortDate(event.start)}</span> {event.title}{" "}
              <span className="text-xs text-zinc-500">· {event.group}</span>
            </p>
          ))}
        </section>
      ) : null}
      {sections.jobs ? (
        <p className="text-sm">{sections.jobs.count} búsquedas nuevas en el canal de trabajos.</p>
      ) : null}
    </article>
  );
}

function Editor({ issue }: { issue: SemanarioIssue }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(issue.title);
  const [intro, setIntro] = useState(issue.intro);
  const [sections, setSections] = useState<SemanarioSections>(issue.sections);

  const dirty =
    title !== issue.title || intro !== issue.intro || JSON.stringify(sections) !== JSON.stringify(issue.sections);

  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.semanario.listAll.key() });
  const onError = (error: unknown) =>
    toast.error("No se pudo guardar", error instanceof Error ? error.message : "Error inesperado");

  const update = useMutation(orpc.semanario.update.mutationOptions({ onError }));
  const publish = useMutation(orpc.semanario.publish.mutationOptions({ onError }));
  const unpublish = useMutation(orpc.semanario.unpublish.mutationOptions({ onError }));
  const busy = update.isPending || publish.isPending || unpublish.isPending;

  const save = async () => {
    await update.mutateAsync({ id: issue.id, title: title.trim(), intro: intro.trim(), sections });
  };

  // Mutation errors already show a toast; the handlers just stop there
  const run = (action: () => Promise<void>) => () => void action().catch(() => undefined);

  const handleSave = run(async () => {
    await save();
    await refresh();
    toast.success("Cambios guardados");
  });

  const handlePublish = run(async () => {
    if (dirty) await save();
    const published = await publish.mutateAsync({ id: issue.id });
    await refresh();
    toast.success(`Publicado el #${published.number}`, "Ya está en owu.uy/semanario.");
  });

  const handleUnpublish = run(async () => {
    await unpublish.mutateAsync({ id: issue.id });
    await refresh();
    toast.success("Volvió a borrador", "Ya no se ve en el sitio; conserva su número.");
  });

  const set = <K extends keyof SemanarioSections>(key: K, value: SemanarioSections[K]) =>
    setSections((current) => ({ ...current, [key]: value }));

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={issue.status === "published" ? "default" : "secondary"}>
            {issue.status === "published" ? `Publicado · #${issue.number}` : "Borrador"}
          </Badge>
          <span className="text-sm text-muted-foreground">{weekLabel(issue.weekStart)}</span>
          {issue.reviewedBy ? (
            <span className="text-sm text-muted-foreground">· lo revisó {issue.reviewedBy}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issue.status === "published" && issue.number ? (
            <Button asChild size="sm" variant="ghost">
              <a href={`/semanario/${issue.number}`} rel="noopener" target="_blank">
                Ver en el sitio <ArrowUpRight className="ml-1 size-3.5" />
              </a>
            </Button>
          ) : null}
          <Button disabled={!dirty || busy} size="sm" variant="outline" onClick={handleSave}>
            Guardar
          </Button>
          {issue.status === "published" ? (
            <Button disabled={busy} size="sm" variant="secondary" onClick={handleUnpublish}>
              Despublicar
            </Button>
          ) : (
            <Button disabled={busy || !title.trim()} size="sm" onClick={handlePublish}>
              {dirty ? "Guardar y publicar" : "Publicar"}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="editar">
        <TabsList>
          <TabsTrigger value="editar">Editar</TabsTrigger>
          <TabsTrigger value="preview">Vista previa</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-6 pt-4" value="editar">
          <div className="space-y-2">
            <Label htmlFor="semanario-title">Título</Label>
            <Input
              id="semanario-title"
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="semanario-intro">Intro (Markdown)</Label>
            <Textarea
              id="semanario-intro"
              maxLength={4000}
              rows={7}
              value={intro}
              onChange={(event) => setIntro(event.target.value)}
            />
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Hilos destacados ({sections.threads.length})</h3>
            {sections.threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie marcó hilos esta semana.</p>
            ) : (
              <ol className="divide-y divide-border rounded-md border border-border">
                {sections.threads.map((thread, index) => (
                  <li key={thread.permalink} className="flex items-center gap-3 px-3 py-2">
                    <span className="shrink-0 font-terminal text-xs text-muted-foreground">#{thread.channel}</span>
                    <a
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                      href={thread.permalink}
                      rel="noopener"
                      target="_blank"
                    >
                      {thread.title}
                    </a>
                    <span className="shrink-0 text-xs text-muted-foreground">{thread.replies} resp.</span>
                    <RowActions
                      count={sections.threads.length}
                      index={index}
                      onMove={(by) => set("threads", move(sections.threads, index, by))}
                      onRemove={() =>
                        set(
                          "threads",
                          sections.threads.filter((_, i) => i !== index)
                        )
                      }
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Agenda ({sections.events.length})</h3>
            {sections.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos.</p>
            ) : (
              <ol className="divide-y divide-border rounded-md border border-border">
                {sections.events.map((event, index) => (
                  <li key={`${event.url}-${index}`} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-14 shrink-0 font-terminal text-xs text-muted-foreground">
                      {shortDate(event.start)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {event.title} <span className="text-muted-foreground">· {event.group}</span>
                    </span>
                    <RowActions
                      count={sections.events.length}
                      index={index}
                      onMove={(by) => set("events", move(sections.events, index, by))}
                      onRemove={() =>
                        set(
                          "events",
                          sections.events.filter((_, i) => i !== index)
                        )
                      }
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-wrap items-center gap-3 text-sm">
            <h3 className="font-medium">Búsquedas nuevas:</h3>
            {sections.jobs ? (
              <>
                <span>{sections.jobs.count}</span>
                <Button size="sm" variant="ghost" onClick={() => set("jobs", null)}>
                  Sacar del número
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground">no se incluyen</span>
            )}
          </section>

          {sections.newCommunities.length > 0 ? (
            <section className="space-y-2 text-sm">
              <h3 className="font-medium">Nuevos en el directorio</h3>
              <ul className="flex flex-wrap gap-2">
                {sections.newCommunities.map((community) => (
                  <li key={community.slug}>
                    <Badge className="gap-1" variant="outline">
                      {community.name}
                      <button
                        aria-label={`Sacar ${community.name}`}
                        type="button"
                        onClick={() =>
                          set(
                            "newCommunities",
                            sections.newCommunities.filter((item) => item.slug !== community.slug)
                          )
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent className="pt-4" value="preview">
          <Preview intro={intro} sections={sections} title={title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SemanarioClient() {
  const { data: issues, isLoading } = useQuery(orpc.semanario.listAll.queryOptions());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => issues?.find((issue) => issue.id === selectedId) ?? issues?.[0] ?? null,
    [issues, selectedId]
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Semanario</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Owy deja el borrador de la semana los lunes de mañana. Revisalo, sacá lo que no va y publicalo: el número
            sale firmado por quien lo publica.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href="/semanario" rel="noopener" target="_blank">
            Ver /semanario <ArrowUpRight className="ml-1 size-3.5" />
          </a>
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !issues || issues.length === 0 ? (
        <Empty
          description="Owy deja uno cada lunes con los hilos marcados en los canales públicos. Si lo necesitás antes, pedíselo en Slack."
          icon={Newspaper}
          title="Todavía no hay borradores"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Números" className="min-w-0 space-y-1">
            {issues.map((issue) => (
              <button
                key={issue.id}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  issue.id === selected?.id ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-accent"
                )}
                type="button"
                onClick={() => setSelectedId(issue.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{issue.title}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      issue.status === "published" ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {issue.status === "published" ? `#${issue.number}` : "borrador"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{weekLabel(issue.weekStart)}</span>
              </button>
            ))}
          </nav>
          {/* Keyed by version: a save or publish loads the server's copy, a background refetch doesn't wipe edits */}
          {selected ? <Editor key={`${selected.id}-${selected.updatedAt}`} issue={selected} /> : null}
        </div>
      )}
    </div>
  );
}
