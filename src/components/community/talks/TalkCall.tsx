"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Undo2 } from "lucide-react";

import { signIn, useSession } from "app/lib/auth-client";
import { EmailCodeForm } from "components/shared/Auth/EmailCodeForm";
import { Badge, buttonClassName, cardClassName } from "components/community/ui";
import { shortWhen } from "lib/community/time";
import { topicLabel } from "lib/community/topics";
import { orpc } from "lib/orpc/client";
import { FORMAT_LABEL, type MyProposal, type TalkRequest } from "lib/orpc/talks/schemas";

import { emptyDraft, ProposalForm, type ProposalDraft } from "./ProposalForm";
import { SpeakerProfileForm } from "./SpeakerProfileForm";

const CLAIM_STATE: Record<string, string> = {
  claimed: "La tomó",
  scheduled: "Va en",
  given: "La diste en",
  released: "",
};

/**
 * The call for talks on /dar-una-charla: what communities are looking for, the form (after signing
 * in with Slack or an email code) and the speaker's own proposals and profile.
 */
export function TalkCall() {
  const session = useSession();
  const user = session.data?.user;
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Signing in with a code: the session shows up before a new account names itself, so the sign-in
  // stays until it says it's done
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => {
    if (!session.isPending && !user) setSigningIn(true);
  }, [session.isPending, user]);
  const requests = useQuery(orpc.talks.requests.open.queryOptions({ staleTime: 60_000 }));
  const communities = useQuery({
    ...orpc.communities.list.queryOptions({ input: {} }),
    staleTime: 5 * 60_000,
    select: (all) => all.filter((item) => item.listed).map(({ id, name }) => ({ id, name })),
  });
  const current = draft ?? emptyDraft(user?.name ?? "");

  const goToForm = () => document.getElementById("proponer-form")?.scrollIntoView({ behavior: "smooth" });
  const proposeFor = (request: TalkRequest) => {
    setEditingId(null);
    setNotice(null);
    setDraft({
      ...emptyDraft(user?.name ?? ""),
      ...(draft && !editingId ? draft : {}),
      anywhere: false,
      communityIds: [request.community.id],
      notes: `Por su pedido: ${request.topic}`,
    });
    goToForm();
  };

  return (
    <div className="flex flex-col gap-12">
      <OpenRequests requests={requests.data} failed={requests.isError} onPropose={proposeFor} />

      <div className="scroll-mt-24" id="proponer-form">
        {/* Mid sign-in the session refetches: keep the sign-in mounted, or a new account loses its step */}
        {signingIn || (!session.isPending && !user) ? (
          <SignIn
            // The form opens with the name they just gave
            onSignedIn={() => void session.refetch().finally(() => setSigningIn(false))}
          />
        ) : session.isPending || !user ? (
          <div className={cardClassName(false, "h-48 animate-pulse")} />
        ) : (
          <div className="flex flex-col gap-4">
            {notice ? (
              <p
                className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-zinc-100"
                role="status"
              >
                {notice}
              </p>
            ) : null}
            <ProposalForm
              communities={communities.data}
              draft={current}
              editingId={editingId}
              onDraft={setDraft}
              onDone={(message) => {
                setDraft(null);
                setEditingId(null);
                setNotice(message || null);
              }}
            />
          </div>
        )}
      </div>

      {user && !signingIn ? (
        <>
          <MyProposals
            onEdit={(proposal) => {
              setEditingId(proposal.id);
              setNotice(null);
              setDraft({
                speakerName: proposal.speakerName,
                title: proposal.title,
                abstract: proposal.abstract,
                format: proposal.format,
                level: proposal.level,
                topics: proposal.topics as ProposalDraft["topics"],
                language: proposal.language as ProposalDraft["language"],
                firstTime: proposal.firstTime,
                recordingOk: proposal.recordingOk,
                communityIds: proposal.communityIds,
                notes: proposal.notes,
                anywhere: proposal.communityIds.length === 0,
              });
              goToForm();
            }}
          />
          <section aria-labelledby="perfil-orador" className="flex flex-col gap-4">
            <div>
              <h3 className="font-title text-xl font-semibold text-white" id="perfil-orador">
                Tu perfil de orador/a
              </h3>
              <p className="mt-1 text-sm text-zinc-400">Así te conocen quienes organizan antes de escribirte.</p>
            </div>
            <SpeakerProfileForm userId={user.id} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function OpenRequests({
  requests,
  failed,
  onPropose,
}: {
  requests: TalkRequest[] | undefined;
  failed: boolean;
  onPropose: (request: TalkRequest) => void;
}) {
  // Nothing asked for, or a hiccup loading them: the form is what matters here
  if (failed || !requests || requests.length === 0) return null;

  return (
    <section aria-labelledby="buscan-charla" className="flex flex-col gap-4">
      <h3 className="font-title text-xl font-semibold text-white" id="buscan-charla">
        Comunidades que buscan charla
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2">
        {requests.map((request) => (
          <li key={request.id} className={cardClassName(false, "flex flex-col gap-3 p-5")}>
            <div className="flex items-start gap-3">
              <Megaphone aria-hidden className="mt-0.5 size-4 shrink-0 text-yellow-400" />
              <div className="min-w-0">
                <p className="font-medium text-white">Buscamos charla sobre {request.topic}</p>
                <p className="text-sm text-zinc-400">
                  <Link className="hover:text-white" href={`/comunidad/${request.community.slug}`}>
                    {request.community.name}
                  </Link>
                </p>
              </div>
            </div>
            {request.details ? <p className="text-sm leading-relaxed text-zinc-300">{request.details}</p> : null}
            <button
              aria-label={`Proponer esta: ${request.topic}, para ${request.community.name}`}
              className={buttonClassName("secondary", "sm", "self-start")}
              type="button"
              onClick={() => onPropose(request)}
            >
              Proponer esta
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  return (
    <div className={cardClassName(false, "flex max-w-xl flex-col gap-4 p-5 sm:p-7")}>
      <h3 className="font-title text-xl font-semibold text-white">Entrá para proponer</h3>
      <p className="text-sm leading-relaxed text-zinc-400">
        Así te avisamos cuando una comunidad la quiera y podés editarla después. Las comunidades que la tomen ven tu
        email para coordinar con vos.
      </p>
      <button
        className={buttonClassName("secondary", "md", "w-full")}
        type="button"
        onClick={() => void signIn.social({ provider: "slack", callbackURL: "/dar-una-charla#proponer" })}
      >
        Entrar con Slack
      </button>
      <EmailCodeForm onSignedIn={onSignedIn} />
    </div>
  );
}

function MyProposals({ onEdit }: { onEdit: (proposal: MyProposal) => void }) {
  const mine = useQuery(orpc.talks.mine.queryOptions());

  return (
    <section aria-labelledby="tus-propuestas" className="flex flex-col gap-4">
      <h3 className="font-title text-xl font-semibold text-white" id="tus-propuestas">
        Tus propuestas
      </h3>
      {mine.isError ? (
        <div className={cardClassName(false, "flex items-center justify-between gap-4 p-5")} role="alert">
          <p className="text-sm text-red-300">No pudimos cargar tus propuestas.</p>
          <button className={buttonClassName("secondary", "sm")} type="button" onClick={() => void mine.refetch()}>
            Reintentar
          </button>
        </div>
      ) : !mine.data ? (
        <div className={cardClassName(false, "h-24 animate-pulse")} />
      ) : mine.data.length === 0 ? (
        <p className="text-sm text-zinc-400">Todavía no propusiste ninguna. La primera es la más difícil.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {mine.data.map((proposal) => (
            <MyProposalRow key={proposal.id} proposal={proposal} onEdit={() => onEdit(proposal)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MyProposalRow({ proposal, onEdit }: { proposal: MyProposal; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const withdraw = useMutation(
    orpc.talks.withdraw.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.talks.mine.key() }),
    })
  );
  const open = proposal.status === "open";
  const { claim } = proposal;

  return (
    <li className={cardClassName(false, "flex flex-col gap-3 p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-white">{proposal.title}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {FORMAT_LABEL[proposal.format]} · {proposal.topics.map(topicLabel).join(", ")}
          </p>
        </div>
        <Badge tone={open ? "accent" : "neutral"}>{open ? (claim ? "Tomada" : "Abierta") : "Retirada"}</Badge>
      </div>
      {claim && claim.status !== "released" ? (
        <p className="text-sm text-zinc-300">
          {CLAIM_STATE[claim.status]} {claim.event ? claim.event.name : claim.community.name}
          {claim.event ? ` (${claim.community.name}), ${shortWhen(claim.event.startDate)}` : ""}
          {claim.event?.url ? (
            <>
              {" · "}
              <Link className="underline underline-offset-4 hover:text-white" href={claim.event.url}>
                Ver el evento
              </Link>
            </>
          ) : null}
        </p>
      ) : open ? (
        <p className="text-sm text-zinc-400">
          {proposal.communityIds.length === 0
            ? "A la vista de todas las comunidades de OWU."
            : `Se la propusiste a ${proposal.communityIds.length === 1 ? "una comunidad" : `${proposal.communityIds.length} comunidades`}.`}
        </p>
      ) : null}
      {open ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-sm text-zinc-300">
              {claim ? `Le avisamos a ${claim.community.name} que la retirás.` : "Sale de todas las comunidades."}
            </p>
            <button
              className={buttonClassName("secondary", "sm")}
              disabled={withdraw.isPending}
              type="button"
              onClick={() => withdraw.mutate({ proposalId: proposal.id })}
            >
              Retirar la propuesta
            </button>
            <button className={buttonClassName("ghost", "sm")} type="button" onClick={() => setConfirming(false)}>
              Volver
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button className={buttonClassName("secondary", "sm")} type="button" onClick={onEdit}>
              <Pencil aria-hidden className="mr-1.5 size-3.5" />
              Editar
            </button>
            <button className={buttonClassName("ghost", "sm")} type="button" onClick={() => setConfirming(true)}>
              <Undo2 aria-hidden className="mr-1.5 size-3.5" />
              Retirar
            </button>
          </div>
        )
      ) : null}
      {withdraw.isError ? (
        <p className="text-sm text-red-300" role="alert">
          {withdraw.error.message}
        </p>
      ) : null}
    </li>
  );
}
