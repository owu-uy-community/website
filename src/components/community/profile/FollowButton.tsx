"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, Check } from "lucide-react";

import { signIn, useSession } from "app/lib/auth-client";
import { buttonClassName } from "components/community/ui";
import { EmailCodeForm } from "components/shared/Auth/EmailCodeForm";
import { orpc } from "lib/orpc/client";

/**
 * "Seguir": an email each time the community publishes an event. Signing in happens right here
 * (Slack or a code by email); coming back from Slack with ?seguir finishes the follow.
 */
export function FollowButton({ communityId }: { communityId: string }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [signingIn, setSigningIn] = useState(false);
  const input = { communityId };
  const state = useQuery(orpc.communities.followState.queryOptions({ input }));
  const settle = {
    onSuccess: (data: { followers: number; following: boolean }) =>
      queryClient.setQueryData(orpc.communities.followState.queryKey({ input }), data),
  };
  const follow = useMutation(orpc.communities.follow.mutationOptions(settle));
  const unfollow = useMutation(orpc.communities.unfollow.mutationOptions(settle));

  const resumed = useRef(false);
  const signedIn = Boolean(session.data);
  useEffect(() => {
    // Read here, not with useSearchParams: the profile is a static page
    if (resumed.current || !signedIn || !new URLSearchParams(window.location.search).has("seguir")) return;
    resumed.current = true;
    follow.mutate(input);
    router.replace(pathname, { scroll: false });
  });

  const following = state.data?.following ?? false;
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
      {failed ? <p className="basis-full text-[14px] text-red-300">No se pudo. Probá de nuevo.</p> : null}
      {signingIn && !signedIn ? (
        <div className="flex max-w-sm basis-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[14px] text-zinc-400">
            Para seguirla y enterarte de cada evento, entrá con el Slack de OWU o con un código por email.
          </p>
          <button
            className={buttonClassName("secondary", "md", "w-full")}
            type="button"
            onClick={() => void signIn.social({ provider: "slack", callbackURL: `${pathname}?seguir=1` })}
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
