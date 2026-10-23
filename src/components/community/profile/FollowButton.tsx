"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, Check } from "lucide-react";

import { signIn, useSession } from "app/lib/auth-client";
import { buttonClassName } from "components/community/ui";
import { EmailCodeForm } from "components/shared/Auth/EmailCodeForm";
import { orpc } from "lib/orpc/client";

/** The community a Slack sign-in was started to follow, in this tab only */
const PENDING = "owu:follow-after-sign-in";

const DIGESTS = [
  { value: "each", label: "Cada evento", hint: "Un mail cuando publica uno" },
  { value: "weekly", label: "Un resumen por semana", hint: "Los lunes, lo que viene en dos semanas" },
] as const;

/**
 * "Seguir": an email each time the community publishes an event, or a weekly digest if they pick
 * it. Signing in happens right here (Slack or a code by email); coming back from Slack finishes the
 * follow it started.
 */
export function FollowButton({ communityId }: { communityId: string }) {
  const session = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [signingIn, setSigningIn] = useState(false);
  const input = { communityId };
  const state = useQuery(orpc.communities.followState.queryOptions({ input }));
  const settle = {
    onSuccess: (data: { followers: number; following: boolean; digest: "each" | "weekly" | null }) =>
      queryClient.setQueryData(orpc.communities.followState.queryKey({ input }), data),
  };
  const follow = useMutation(orpc.communities.follow.mutationOptions(settle));
  const unfollow = useMutation(orpc.communities.unfollow.mutationOptions(settle));

  const resumed = useRef(false);
  const signedIn = Boolean(session.data);
  // Back from Slack: finish the follow this browser started (a link alone never follows anyone)
  useEffect(() => {
    if (resumed.current || !signedIn || sessionStorage.getItem(PENDING) !== communityId) return;
    resumed.current = true;
    sessionStorage.removeItem(PENDING);
    follow.mutate(input);
  });

  const following = state.data?.following ?? false;
  // The choice shows at once; the server confirms it
  const digest = (follow.isPending && follow.variables?.digest) || state.data?.digest || "each";
  const followers = state.data?.followers ?? 0;
  const failed = follow.isError || unfollow.isError;

  return (
    <>
      <button
        aria-pressed={following}
        className={buttonClassName(following ? "secondary" : "primary", "md")}
        disabled={session.isPending || follow.isPending || unfollow.isPending}
        type="button"
        onClick={() =>
          following ? unfollow.mutate(input) : signedIn ? follow.mutate(input) : setSigningIn((open) => !open)
        }
      >
        {following ? <Check aria-hidden className="mr-2 size-4" /> : <BellPlus aria-hidden className="mr-2 size-4" />}
        {following ? "Siguiendo" : "Seguir"}
        {followers > 0 ? <span className="ml-2 font-normal tabular-nums opacity-70">{followers}</span> : null}
      </button>
      {following ? (
        <fieldset className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-zinc-300">
          <legend className="sr-only">Cómo te avisamos</legend>
          {DIGESTS.map((option) => (
            <label key={option.value} className="flex min-h-6 cursor-pointer items-center gap-2" title={option.hint}>
              <input
                checked={digest === option.value}
                className="size-4 accent-yellow-400"
                disabled={follow.isPending}
                name={`digest-${communityId}`}
                type="radio"
                value={option.value}
                onChange={() => follow.mutate({ communityId, digest: option.value })}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {failed ? <p className="basis-full text-[14px] text-red-300">No se pudo. Probá de nuevo.</p> : null}
      {signingIn && !signedIn ? (
        <div className="flex max-w-sm basis-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[14px] text-zinc-400">
            Para seguirla y enterarte de cada evento, entrá con el Slack de OWU o con un código por email.
          </p>
          <button
            className={buttonClassName("secondary", "md", "w-full")}
            type="button"
            onClick={() => {
              sessionStorage.setItem(PENDING, communityId);
              void signIn.social({ provider: "slack", callbackURL: pathname });
            }}
          >
            Entrar con Slack
          </button>
          <EmailCodeForm
            onSignedIn={() => {
              setSigningIn(false);
              void session.refetch().then(() => follow.mutate(input));
            }}
          />
        </div>
      ) : null}
    </>
  );
}
