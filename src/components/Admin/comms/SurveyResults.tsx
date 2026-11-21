"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Copy, DoorOpen, QrCode as QrIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { Meter, MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { QuestionResult, SurveyResults as Results } from "lib/orpc/surveys/schemas";

import { QrCode } from "./QrCode";

const decimal = (value: number) => value.toLocaleString("es-UY", { maximumFractionDigits: 1 });
/** NPS reads with its sign: +42, −8, 0. */
const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");
const npsTone = (value: number | null) =>
  value === null
    ? "text-muted-foreground"
    : value > 0
      ? "text-success-foreground"
      : value < 0
        ? "text-live-foreground"
        : "text-foreground";
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Answers per value as small columns; `tone` colors each column by its value. */
function Histogram({ counts, from, tone }: { counts: number[]; from: number; tone: (value: number) => string }) {
  const max = Math.max(1, ...counts);

  return (
    <div
      className="flex items-end gap-1"
      role="img"
      aria-label={counts.map((count, index) => `${from + index}: ${count}`).join(", ")}
    >
      {counts.map((count, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="font-terminal text-3xs text-muted-foreground tabular-nums">{count || ""}</span>
          <div className="flex h-14 w-full items-end overflow-hidden rounded-sm bg-white/[0.03]">
            <div
              className={cn("w-full rounded-sm", count ? tone(from + index) : "")}
              style={{ height: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="font-terminal text-2xs text-muted-foreground tabular-nums">{from + index}</span>
        </div>
      ))}
    </div>
  );
}

const npsColumn = (value: number) => (value >= 9 ? "bg-success" : value >= 7 ? "bg-warning" : "bg-live");

function NpsSummary({ question }: { question: Extract<QuestionResult, { kind: "nps" }> }) {
  const total = question.answered;

  return (
    <div className="space-y-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="bg-live" style={{ width: `${percent(question.detractors, total)}%` }} />
        <div className="bg-warning" style={{ width: `${percent(question.passives, total)}%` }} />
        <div className="bg-success" style={{ width: `${percent(question.promoters, total)}%` }} />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted-foreground">
        <span>
          <span className="font-terminal text-live-foreground tabular-nums">{question.detractors}</span> detractores
          (0–6)
        </span>
        <span>
          <span className="font-terminal text-warning-foreground tabular-nums">{question.passives}</span> neutrales
          (7–8)
        </span>
        <span>
          <span className="font-terminal text-success-foreground tabular-nums">{question.promoters}</span> promotores
          (9–10)
        </span>
      </p>
      <Histogram counts={question.distribution} from={0} tone={npsColumn} />
    </div>
  );
}

function QuestionBlock({ question }: { question: QuestionResult }) {
  return (
    <li className="space-y-2.5 px-3.5 py-3.5">
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 text-ui font-medium text-foreground">{question.label}</h3>
        <span className="shrink-0 font-terminal text-meta text-muted-foreground tabular-nums">
          {question.answered} {question.answered === 1 ? "respuesta" : "respuestas"}
          {question.kind === "nps" && question.score !== null ? (
            <span className={npsTone(question.score)}> · NPS {signed(question.score)}</span>
          ) : null}
        </span>
      </div>
      {question.kind === "nps" ? <NpsSummary question={question} /> : null}
      {question.kind === "rating" ? (
        <div className="grid items-end gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div>
            <p className="font-terminal text-[22px] leading-7 font-semibold text-foreground tabular-nums">
              {question.average === null ? "—" : decimal(question.average)}
              <span className="ml-1 text-meta font-normal text-muted-foreground">/ 5</span>
            </p>
            <Meter className="mt-2" max={5} tone="info" value={question.average ?? 0} />
          </div>
          <Histogram counts={question.distribution} from={1} tone={() => "bg-info-foreground/70"} />
        </div>
      ) : null}
      {question.kind === "choice" ? (
        <ul className="space-y-2">
          {question.options.map((option) => (
            <li key={option.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem] items-center gap-3">
              <span className="truncate text-meta text-subtle">{option.label}</span>
              <Meter max={Math.max(question.answered, 1)} tone="info" value={option.count} />
              <span className="text-right font-terminal text-2xs text-muted-foreground tabular-nums">
                {option.count} · {percent(option.count, question.answered)}%
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {question.kind === "text" ? (
        question.latest.length === 0 ? (
          <p className="text-meta text-muted-foreground">Sin respuestas todavía.</p>
        ) : (
          <ul className="space-y-2">
            {question.latest.slice(0, 6).map((entry, index) => (
              <li key={index} className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-ui break-words whitespace-pre-line text-foreground">{entry.text}</p>
                <p className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <RelativeTime className="text-2xs" date={entry.createdAt} />
                  {entry.room ? <span>· {entry.room}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

function RoomsTable({ rooms }: { rooms: Results["rooms"] }) {
  return (
    <Panel>
      <PanelHead icon={DoorOpen} meta="desde el QR de cada sala" title="Por sala" />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sala</TableHead>
              <TableHead className="text-right">Respuestas</TableHead>
              <TableHead className="text-right">NPS</TableHead>
              <TableHead className="text-right">Puntaje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => (
              <TableRow key={room.roomId ?? "general"}>
                <TableCell className={room.roomId ? "text-foreground" : "text-muted-foreground"}>{room.name}</TableCell>
                <TableCell className="text-right font-terminal tabular-nums">{room.responses}</TableCell>
                <TableCell className={cn("text-right font-terminal tabular-nums", npsTone(room.nps))}>
                  {room.nps === null ? "—" : signed(room.nps)}
                </TableCell>
                <TableCell className="text-right font-terminal tabular-nums">
                  {room.rating === null ? "—" : decimal(room.rating)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

/** Each room's link and QR (`?sala=`), so its answers land under it. */
function RoomQrs({ eventId, surveyUrl }: { eventId: string; surveyUrl: string }) {
  const rooms = useQuery(
    orpc.rooms.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId }, staleTime: 5 * 60_000 })
  );
  const links = [
    { id: "general", name: "Link general", url: surveyUrl },
    ...(rooms.data ?? [])
      .filter((room) => room.isActive)
      .map((room) => ({ id: room.id, name: room.name, url: `${surveyUrl}?sala=${room.id}` })),
  ];

  return (
    <Panel>
      <PanelHead icon={QrIcon} meta={`${links.length - 1} salas`} title="QR por sala" />
      {rooms.isError ? (
        <div className="p-3.5">
          <ErrorState compact onRetry={() => void rooms.refetch()} />
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 2xl:grid-cols-6">
          {links.map((link) => (
            <li key={link.id} className="flex flex-col items-center gap-2 bg-card px-2 py-3">
              <QrCode className="rounded-sm" size={88} title={`QR de la encuesta · ${link.name}`} value={link.url} />
              <span className="max-w-full truncate text-meta text-subtle">{link.name}</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  void navigator.clipboard.writeText(link.url).then(
                    () => toast.success("Link copiado", link.name),
                    () => toast.error("No se pudo copiar", link.url)
                  )
                }
              >
                <Copy />
                Copiar link
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** What people answered: the NPS up top, then each question, each room, and the rooms' QR. */
export function SurveyResults({ eventId, surveyUrl }: { eventId: string; surveyUrl: string | undefined }) {
  const results = useQuery(orpc.surveys.results.queryOptions({ input: { eventId }, staleTime: 15_000 }));

  if (results.isPending) return <Skeleton className="h-80 rounded-lg" />;
  if (results.isError) return <ErrorState onRetry={() => void results.refetch()} retrying={results.isFetching} />;

  const data = results.data;
  const answered = data && data.responses > 0;

  return (
    <div className="min-w-0 space-y-4">
      <Panel>
        <PanelHead icon={BarChart3} title="Resultados" />
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <div className="px-3.5 py-3">
            <MicroLabel>Respuestas</MicroLabel>
            <p className="mt-1.5 font-terminal text-[26px] leading-8 font-semibold text-foreground tabular-nums">
              {data?.responses ?? 0}
            </p>
          </div>
          <div className="px-3.5 py-3">
            <MicroLabel>NPS</MicroLabel>
            <p
              className={cn(
                "mt-1.5 font-terminal text-[26px] leading-8 font-semibold tabular-nums",
                npsTone(data?.nps ?? null)
              )}
            >
              {data?.nps == null ? "—" : signed(data.nps)}
            </p>
          </div>
          <div className="px-3.5 py-3">
            <MicroLabel>Última</MicroLabel>
            <p className="mt-2.5">
              {data?.lastResponseAt ? (
                <RelativeTime className="text-ui" date={data.lastResponseAt} />
              ) : (
                <span className="text-ui text-muted-foreground">—</span>
              )}
            </p>
          </div>
        </div>
        {answered ? (
          <ul className="divide-y divide-border">
            {data.questions.map((question) => (
              <QuestionBlock key={question.id} question={question} />
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            description="Compartí el link o pegá los QR en las salas: las respuestas aparecen acá en vivo."
            icon={BarChart3}
            title="Todavía no respondió nadie"
          />
        )}
      </Panel>
      {answered && data.rooms.length > 0 ? <RoomsTable rooms={data.rooms} /> : null}
      {surveyUrl ? <RoomQrs eventId={eventId} surveyUrl={surveyUrl} /> : null}
    </div>
  );
}
