"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Flag, Plus, Search, Send, Sprout } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { CommunityMark } from "components/shared/CommunityMark";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { TOPICS, topicLabel, type Topic } from "lib/community/topics";
import { plural } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";

export type ClaimableCommunity = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: "activa" | "pausa" | "busca-organizadores";
  topics: string[];
};

type Claim = {
  id: string;
  communityId: string;
  communityName: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

type Relation = (typeof RELATIONS)[number]["value"];

const RELATIONS = [
  { value: "organizo", title: "La organizo", hint: "Soy de quienes la llevan adelante" },
  { value: "coorganizo", title: "Coorganizo", hint: "Ayudo a organizar con otras personas" },
  { value: "retomar", title: "Quiero retomarla", hint: "Está en pausa o busca quien la organice" },
] as const;

const STATUS = {
  pending: { label: "En revisión", variant: "warning" },
  approved: { label: "Aprobado", variant: "success" },
  rejected: { label: "No aprobado", variant: "secondary" },
} as const;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Ask to organize a community from the directory, or propose one that isn't there yet; site staff
 * confirm either.
 */
export function ClaimClient({
  communities,
  claims,
  organizedIds,
  proposing = false,
}: {
  communities: ClaimableCommunity[];
  claims: Claim[];
  organizedIds: string[];
  /** Open on the proposal form (the landing's "Sumá tu comunidad") */
  proposing?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string | null>(proposing ? "" : null);
  const [relation, setRelation] = useState<Relation>("organizo");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const claimed = new Map(claims.map((claim) => [claim.communityId, claim]));
  const organized = new Set(organizedIds);

  const visible = useMemo(() => {
    const needle = normalize(search.trim());

    return needle ? communities.filter((community) => normalize(community.name).includes(needle)) : communities;
  }, [communities, search]);
  const chosen = communities.find((community) => community.id === selected) ?? null;

  const claim = useMutation(
    orpc.communities.claim.mutationOptions({
      onSuccess: (result) => {
        toast.success("Pedido enviado", `El staff de OWU revisa tu pedido para ${result.communityName}.`);
        setSelected(null);
        setMessage("");
        setLink("");
        router.refresh();
      },
      onError: (error) => toast.error("No se pudo enviar el pedido", error.message),
    })
  );

  const propose = (name: string) => {
    setSelected(null);
    setProposal(name);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Panel>
        <PanelHead
          icon={Flag}
          meta={plural(communities.length, "comunidad", "comunidades")}
          title="Comunidades en OWU"
        />
        <div className="border-b border-border p-3">
          <label className="relative block">
            <span className="sr-only">Buscar comunidad</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              placeholder="Buscar comunidad…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {visible.map((community) => {
            const claim = claimed.get(community.id);
            const mine = organized.has(community.id);
            const isSelected = community.id === selected;

            return (
              <li key={community.id}>
                <button
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-raised disabled:cursor-default disabled:hover:bg-transparent",
                    isSelected && "bg-raised shadow-[inset_2px_0_0_hsl(var(--primary))]"
                  )}
                  disabled={mine || claim?.status === "pending"}
                  type="button"
                  onClick={() => {
                    setProposal(null);
                    setSelected(community.id);
                  }}
                >
                  <CommunityMark community={community} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium text-foreground">{community.name}</span>
                    <span className="block truncate text-meta text-muted-foreground">
                      {community.topics.map(topicLabel).join(" · ") || "General"}
                    </span>
                  </span>
                  {mine ? (
                    <Badge variant="success">Ya la organizás</Badge>
                  ) : claim ? (
                    <Badge variant={STATUS[claim.status].variant}>{STATUS[claim.status].label}</Badge>
                  ) : community.status === "busca-organizadores" ? (
                    <Badge variant="info">Busca organizadores</Badge>
                  ) : community.status === "pausa" ? (
                    <Badge variant="secondary">En pausa</Badge>
                  ) : null}
                </button>
              </li>
            );
          })}
          {visible.length === 0 ? (
            <li>
              <EmptyState
                compact
                action={
                  <Button size="sm" onClick={() => propose(search.trim())}>
                    <Sprout />
                    Proponé tu comunidad
                  </Button>
                }
                description={
                  search.trim()
                    ? `Ninguna comunidad de OWU se llama «${search.trim()}». Si es tuya, sumala: el staff la revisa y te avisa.`
                    : "Sumá la tuya: el staff la revisa y te avisa."
                }
                icon={Search}
                title={search.trim() ? "No está en la lista" : "Todavía no hay comunidades en la lista"}
              />
            </li>
          ) : null}
        </ul>
        {visible.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-2.5">
            <span className="text-meta text-muted-foreground">¿Tu comunidad no está en la lista?</span>
            <Button size="sm" variant="ghost" onClick={() => propose(search.trim())}>
              <Plus />
              Proponé tu comunidad
            </Button>
          </div>
        ) : null}
      </Panel>

      <div className="flex flex-col gap-4">
        {proposal !== null ? (
          <ProposeForm key={proposal} initialName={proposal} onCancel={() => setProposal(null)} />
        ) : (
          <Panel>
            <PanelHead icon={Send} title={chosen ? `Organizar ${chosen.name}` : "Tu pedido"} />
            {chosen ? (
              <form
                className="flex flex-col gap-4 p-3.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  claim.mutate({ communityId: chosen.id, relation, message, link: link.trim() || null });
                }}
              >
                <RelationField relation={relation} onChange={setRelation} />
                <label className="flex flex-col gap-1.5">
                  <span className="text-meta text-muted-foreground">Contale al staff quién sos (opcional)</span>
                  <Textarea
                    maxLength={1000}
                    rows={3}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-meta text-muted-foreground">
                    Un link que lo muestre: Meetup, LinkedIn… (opcional)
                  </span>
                  <Input
                    inputMode="url"
                    placeholder="https://"
                    type="url"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                  />
                </label>
                <Button disabled={claim.isPending} type="submit">
                  <Send />
                  Enviar pedido
                </Button>
              </form>
            ) : (
              <EmptyState
                compact
                description="Elegí tu comunidad en la lista, o proponela si todavía no está."
                icon={Flag}
                title="¿Qué comunidad organizás?"
              />
            )}
          </Panel>
        )}

        {claims.length > 0 ? (
          <Panel>
            <PanelHead meta={claims.length} title="Tus pedidos" />
            <ul className="divide-y divide-border">
              {claims.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui text-foreground">{item.communityName}</span>
                    <RelativeTime className="font-terminal text-2xs text-muted-foreground" date={item.createdAt} />
                  </span>
                  <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function RelationField({ relation, onChange }: { relation: Relation; onChange: (relation: Relation) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2">
        <MicroLabel>¿Qué hacés en la comunidad?</MicroLabel>
      </legend>
      {RELATIONS.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-raised/50 p-3 transition-colors hover:border-subtle/40",
            relation === option.value && "border-primary/60 bg-primary-surface"
          )}
        >
          <input
            checked={relation === option.value}
            className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
            name="relation"
            type="radio"
            value={option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            <span className="block text-ui font-medium text-foreground">{option.title}</span>
            <span className="block text-meta text-muted-foreground">{option.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** A community that isn't in OWU yet: its name, where it shows up, its topics. Staff approve it. */
function ProposeForm({ initialName, onCancel }: { initialName: string; onCancel: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [relation, setRelation] = useState<Relation>("organizo");
  const [links, setLinks] = useState(["", ""]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [message, setMessage] = useState("");
  const propose = useMutation(
    orpc.communities.propose.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          "Propuesta enviada",
          `El staff de OWU revisa ${result.communityName} y te avisamos por mail cuando la sumen.`
        );
        onCancel();
        router.refresh();
      },
      onError: (error) => toast.error("No se pudo enviar la propuesta", error.message),
    })
  );
  const filled = links.map((value) => value.trim()).filter(Boolean);

  return (
    <Panel>
      <PanelHead icon={Sprout} title="Proponé tu comunidad" />
      <form
        className="flex flex-col gap-4 p-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          propose.mutate({ name: name.trim(), relation, links: filled, topics, message });
        }}
      >
        <p className="text-meta text-muted-foreground">
          La sumamos a OWU cuando el staff la revise. Te avisamos por mail y desde ese momento tenés el panel.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-meta text-muted-foreground">Nombre</span>
          <Input
            autoComplete="off"
            maxLength={80}
            placeholder="Rust Uruguay"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-meta text-muted-foreground" id="propose-links">
            Dónde se la ve: su Meetup, sitio o redes (al menos uno)
          </span>
          {links.map((value, index) => (
            <Input
              // oxlint-disable-next-line react/no-array-index-key -- a fixed list of link slots
              key={index}
              aria-describedby="propose-links"
              aria-label={index === 0 ? "Link principal" : `Otro link (${index})`}
              inputMode="url"
              placeholder={index === 0 ? "https://www.meetup.com/…" : "https:// (opcional)"}
              required={index === 0}
              type="url"
              value={value}
              onChange={(event) => setLinks(links.map((item, at) => (at === index ? event.target.value : item)))}
            />
          ))}
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-meta text-muted-foreground">Temas (hasta 5)</legend>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((topic) => {
              const on = topics.includes(topic.value);

              return (
                <button
                  key={topic.value}
                  aria-pressed={on}
                  className={cn(
                    "min-h-7 rounded-md border px-2 py-1 text-meta transition-colors disabled:opacity-60",
                    on
                      ? "border-primary/60 bg-primary-surface text-foreground"
                      : "border-input text-muted-foreground hover:text-foreground"
                  )}
                  disabled={!on && topics.length >= 5}
                  type="button"
                  onClick={() =>
                    setTopics(on ? topics.filter((value) => value !== topic.value) : [...topics, topic.value])
                  }
                >
                  {topic.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <RelationField relation={relation} onChange={setRelation} />
        <label className="flex flex-col gap-1.5">
          <span className="text-meta text-muted-foreground">Contale al staff quiénes son (opcional)</span>
          <Textarea maxLength={1000} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={propose.isPending || name.trim().length < 2 || filled.length === 0} type="submit">
            <Send />
            Enviar la propuesta
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Volver
          </Button>
        </div>
      </form>
    </Panel>
  );
}
