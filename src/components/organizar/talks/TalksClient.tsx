"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Heart, Inbox, Lock } from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog } from "components/Admin/panel";
import { PageContainer, PageHeader, Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { toast } from "components/shared/ui/toast-utils";
import { TOPICS } from "lib/community/topics";
import { orpc } from "lib/orpc/client";
import { FORMAT_LABEL, LEVEL_LABEL, TALK_FORMATS, TALK_LEVELS, type InboxProposal } from "lib/orpc/talks/schemas";
import { plural } from "lib/organizar/words";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { usePanel } from "../shell/context";
import { CardHead, SpeakerBlock, TalkFacts } from "./parts";
import { TakenTalks } from "./TakenTalks";
import { TalkRequests } from "./TalkRequests";

const TABS = [
  { key: "propuestas", title: "Propuestas" },
  { key: "tomadas", title: "Tomadas" },
  { key: "pedidos", title: "Pedidos" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * Charlas: talks people proposed to this community or to any of OWU, the ones it took, and what
 * it's looking for. One community at a time holds a talk; the speaker hears from it by email.
 */
export function TalksClient({ community }: { community: CalendarCommunity }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const asked = params.get("tab");
  const [tab, setTab] = useState<Tab>(TABS.some((item) => item.key === asked) ? (asked as Tab) : "propuestas");
  const go = (key: Tab) => {
    setTab(key);
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  return (
    <PageContainer>
      <PageHeader
        description="Charlas que la gente ofrece desde owu.uy/dar-una-charla: a ustedes o a cualquier comunidad de OWU. Cuando una les sirve, tomala: queda reservada para ustedes y le avisamos a quien la propuso."
        title="Charlas"
      />
      <nav
        aria-label="Secciones de charlas"
        className="mb-5 flex [scrollbar-width:none] gap-5 overflow-x-auto border-b border-border"
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            aria-current={tab === item.key ? "page" : undefined}
            className={cn(
              "relative h-9 shrink-0 text-ui font-medium whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full",
              tab === item.key ? "text-foreground after:bg-primary" : "text-muted-foreground hover:text-foreground"
            )}
            type="button"
            onClick={() => go(item.key)}
          >
            {item.title}
          </button>
        ))}
      </nav>
      {tab === "propuestas" ? <ProposalInbox community={community} onTaken={() => go("tomadas")} /> : null}
      {tab === "tomadas" ? <TakenTalks community={community} /> : null}
      {tab === "pedidos" ? <TalkRequests community={community} /> : null}
    </PageContainer>
  );
}

const ALL = "todos";

function ProposalInbox({ community, onTaken }: { community: CalendarCommunity; onTaken: () => void }) {
  const inbox = useQuery(orpc.talks.inbox.queryOptions({ input: { communityId: community.id } }));
  const [format, setFormat] = useState(ALL);
  const [topic, setTopic] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [firstTime, setFirstTime] = useState(false);
  const [ours, setOurs] = useState(false);

  if (inbox.isError) return <ErrorState onRetry={() => void inbox.refetch()} title="No pudimos traer las propuestas" />;
  if (!inbox.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-44 rounded-lg" />
        <Skeleton className="h-44 rounded-lg" />
      </div>
    );
  }
  const shown = inbox.data.filter(
    (proposal) =>
      (format === ALL || proposal.format === format) &&
      (topic === ALL || proposal.topics.includes(topic)) &&
      (level === ALL || proposal.level === level) &&
      (!firstTime || proposal.firstTime) &&
      (!ours || proposal.forUs)
  );
  const filtered = format !== ALL || topic !== ALL || level !== ALL || firstTime || ours;

  if (inbox.data.length === 0) {
    return (
      <Panel>
        <EmptyState
          description="Cuando alguien proponga una charla a esta comunidad o a cualquiera de OWU, aparece acá y les llega un mail. Mientras, publicá un pedido: sale en owu.uy/dar-una-charla."
          icon={Inbox}
          title="Ninguna propuesta por ahora"
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Formato"
          options={TALK_FORMATS.map((value) => ({ value, label: FORMAT_LABEL[value] }))}
          value={format}
          onChange={setFormat}
        />
        <FilterSelect
          label="Tema"
          options={TOPICS.map(({ value, label }) => ({ value, label }))}
          value={topic}
          onChange={setTopic}
        />
        <FilterSelect
          label="Nivel"
          options={TALK_LEVELS.map((value) => ({ value, label: LEVEL_LABEL[value] }))}
          value={level}
          onChange={setLevel}
        />
        <label className="flex h-8 items-center gap-2 rounded-md border border-input px-2.5 text-meta text-subtle">
          <Switch aria-label="Solo primeras charlas" checked={firstTime} onCheckedChange={setFirstTime} />
          Primera charla
        </label>
        <label className="flex h-8 items-center gap-2 rounded-md border border-input px-2.5 text-meta text-subtle">
          <Switch aria-label="Solo las propuestas a esta comunidad" checked={ours} onCheckedChange={setOurs} />
          Solo para nosotros
        </label>
        <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">
          {plural(shown.length, "propuesta", "propuestas")}
        </span>
      </div>
      {shown.length === 0 ? (
        <Panel>
          <EmptyState
            action={
              filtered ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFormat(ALL);
                    setTopic(ALL);
                    setLevel(ALL);
                    setFirstTime(false);
                    setOurs(false);
                  }}
                >
                  Ver todas
                </Button>
              ) : null
            }
            compact
            title="Ninguna con esos filtros"
          />
        </Panel>
      ) : (
        shown.map((proposal) => (
          <ProposalCard key={proposal.id} community={community} proposal={proposal} onTaken={onTaken} />
        ))
      )}
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: todos</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProposalCard({
  community,
  proposal,
  onTaken,
}: {
  community: CalendarCommunity;
  proposal: InboxProposal;
  onTaken: () => void;
}) {
  const queryClient = useQueryClient();
  const { can, isStaff } = usePanel();
  const [archiving, setArchiving] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.talks.key() });
  const claim = useMutation(
    orpc.talks.claim.mutationOptions({
      onSuccess: () => {
        toast.success("La tomaron", `Le avisamos a ${proposal.speakerName} por mail. Está en Tomadas.`);
        refresh();
        onTaken();
      },
      // Someone else got there first: the card says who once it reloads
      onError: refresh,
    })
  );
  const archive = useMutation(
    orpc.talks.archive.mutationOptions({
      onSuccess: () => {
        setArchiving(false);
        toast.success("Archivada", "Ya no aparece en ninguna comunidad.");
        refresh();
      },
    })
  );

  return (
    <Panel>
      <CardHead
        badge={
          proposal.forUs ? (
            <Badge variant="default">A ustedes</Badge>
          ) : (
            <Badge variant="secondary">A cualquiera de OWU</Badge>
          )
        }
        title={proposal.title}
      />
      <div className="flex flex-col gap-3 p-4">
        <TalkFacts talk={proposal} />
        <p className="line-clamp-5 text-ui whitespace-pre-line text-subtle">{proposal.abstract}</p>
        <SpeakerBlock name={proposal.speakerName} speaker={proposal.speaker} />
        {proposal.notes ? (
          <p className="rounded-md border border-border bg-raised/40 px-3 py-2 text-meta text-subtle">
            «{proposal.notes}»
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {proposal.takenBy ? (
            <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
              <Lock aria-hidden className="size-3.5" />
              La tomó {proposal.takenBy}
            </p>
          ) : can("talk:claim") ? (
            <Button
              disabled={claim.isPending}
              size="sm"
              variant="outline"
              onClick={() => claim.mutate({ communityId: community.id, proposalId: proposal.id })}
            >
              <Heart aria-hidden />
              {claim.isPending ? "Tomándola…" : "La queremos"}
            </Button>
          ) : null}
          {isStaff ? (
            <Button className="ml-auto" size="sm" variant="ghost" onClick={() => setArchiving(true)}>
              <Archive aria-hidden />
              Archivar (spam)
            </Button>
          ) : null}
        </div>
        {claim.isError ? (
          <p className="text-meta text-live-foreground" role="alert">
            {claim.error.message}
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        confirmLabel="Archivar"
        description="Sale de todas las comunidades y nadie recibe aviso. Es para spam o abusos: no se deshace desde acá."
        open={archiving}
        pending={archive.isPending}
        pendingLabel="Archivando…"
        title={`Archivar «${proposal.title}»`}
        onConfirm={() => archive.mutate({ proposalId: proposal.id })}
        onOpenChange={setArchiving}
      />
    </Panel>
  );
}
