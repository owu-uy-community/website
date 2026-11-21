"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, TimerReset } from "lucide-react";

import { PageContainer } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { formatRelative, useNow } from "components/Admin/ui/time";
import { useAttendeeSync } from "components/Admin/attendees/use-attendee-sync";
import { useGo } from "components/Admin/guion/use-go";
import { useCommands } from "components/Admin/shell/commands";
import { navItemFor } from "components/Admin/shell/nav-config";
import { useShell } from "components/Admin/shell/use-shell-status";
import { scopedAdminHref } from "components/Admin/shell/use-selected-event";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";

import { LiveView } from "./LiveView";
import { PrepView } from "./PrepView";
import { ReportView } from "./ReportView";

/** Data older than this means the socket and the poll both stopped: the page says so and greys out. */
const STALE_MS = 60_000;

function HoySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-[104px] w-full" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}

/**
 * Hoy follows the event's phase: Preparación before the day, mission control on it, the
 * report after. One read feeds it, refreshed on a timer and on every ops or staff ping.
 */
export function HoyClient({
  eventId,
  communitySlug,
  eventSlug,
}: {
  eventId: string;
  communitySlug: string;
  eventSlug: string;
}) {
  const { status } = useShell();
  const queryClient = useQueryClient();
  const now = useNow(5_000);
  const live = status?.phase === "live";
  const query = useQuery(
    orpc.dashboard.today.queryOptions({
      input: { eventId },
      staleTime: 10_000,
      refetchInterval: live ? 15_000 : 60_000,
    })
  );

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: orpc.dashboard.today.key({ input: { eventId } }) });
  useRealtimeChannel(eventChannel(eventId, "ops"), refresh);
  useRealtimeChannel(eventChannel(eventId, "staff"), refresh);
  useRealtimeChannel(eventChannel(eventId, "sync"), refresh);
  // Arrivals come from the Eventbrite mirror, so Hoy keeps it fresh too (site staff only).
  useAttendeeSync(status?.me.siteAdmin ? eventId : null);

  // Event pages live under the community; the live desks (OBS, Escenas) are global.
  const href = (path: string) => (navItemFor(path)?.scoped ? scopedAdminHref(communitySlug, path, eventSlug) : path);
  const stale = Boolean(now && query.dataUpdatedAt && now - query.dataUpdatedAt > STALE_MS);
  const data = query.data;

  const { go } = useGo(eventId, refresh);
  const shift = useMutation(
    orpc.runOfShow.shift.mutationOptions({
      onSuccess: ({ moved, collisions }) => {
        const title = `Corrimos ${moved} momento${moved === 1 ? "" : "s"} 5 min`;
        if (moved === 0) toast.info("No había nada para correr");
        else if (collisions.length === 0) toast.success(title);
        else {
          toast.warning({
            title,
            description: collisions.map((item) => `«${item.title}» se pasa ${item.overMin} min`).join(" · "),
            duration: 8000,
          });
        }
      },
      onError: (error) => toast.error("No se pudo correr el guion", error.message),
      onSettled: refresh,
    })
  );
  const rundown = data?.phase === "live" ? data.rundown : null;
  const runGo = () => go.mutate({ eventId });
  const shiftFrom = rundown?.current ?? rundown?.next ?? null;
  const runShift = shiftFrom ? () => shift.mutate({ eventId, fromItemId: shiftFrom.id, minutes: 5 }) : undefined;

  // While mission control is open, the palette offers the day's next step first.
  useCommands(
    "hoy",
    "suggested",
    rundown?.next
      ? [
          {
            id: "hoy.go",
            title: `GO · ${rundown.next.title}`,
            hint: `guion ${rundown.next.plannedStart}`,
            icon: Play,
            tone: "text-primary",
            perform: { type: "run", run: runGo },
          },
          ...(runShift
            ? [
                {
                  id: "hoy.shift",
                  title: "Correr el guion +5 min",
                  icon: TimerReset,
                  perform: { type: "run" as const, run: runShift },
                },
              ]
            : []),
        ]
      : []
  );

  return (
    <PageContainer size="large">
      {query.isError && !data ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} title="No se pudo cargar Hoy" />
      ) : !data ? (
        <HoySkeleton />
      ) : (
        <>
          {stale ? (
            <ErrorState
              compact
              className="mb-4"
              description={`Lo último que llegó es de ${formatRelative(query.dataUpdatedAt - now)}. Revisá la conexión.`}
              onRetry={() => query.refetch()}
              retrying={query.isRefetching}
              title="Estos datos pueden estar viejos"
            />
          ) : null}
          {data.phase === "live" ? (
            <LiveView data={data} going={go.isPending} href={href} stale={stale} onGo={runGo} onShift={runShift} />
          ) : data.phase === "post" ? (
            <ReportView data={data} href={href} />
          ) : (
            <PrepView communitySlug={communitySlug} data={data} href={href} status={status} />
          )}
        </>
      )}
    </PageContainer>
  );
}
