"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client as rpc, orpc } from "lib/orpc/client";
import type { Command } from "lib/orpc/obs-control/schemas";
import type { Cue, ObsStatus, SerializedCommand } from "lib/orpc/obs-control/services";
import { obsControlChannel } from "lib/realtime/channels";

import { getObsClient, useObs } from "./client";

const HEARTBEAT_MS = 10_000;
const REPORT_DEBOUNCE_MS = 300;

/** Stable per-tab id: survives reloads of the same tab, differs between tabs. */
function tabId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "obs-executor-id";
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = `tab-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, id);
  }

  return id;
}

/**
 * The command bus, tab side. Whoever is connected to OBS and holds the seat
 * (`obs_instances.executorId`) runs commands from other devices, Companion and
 * the bot, acks them and reports OBS status back with a heartbeat; every tab
 * mirrors the reported status (so a phone with no OBS socket still sees what
 * is on air) and the cue list.
 */
export function useObsExecutor(instanceId = 1) {
  const obs = useObs();
  const queryClient = useQueryClient();
  const executorId = useMemo(tabId, []);
  const statusKey = orpc.obsControl.status.queryKey({ input: { instanceId } });
  const cuesKey = orpc.obsCue.list.queryKey({ input: { instanceId } });
  const statusQuery = useQuery(
    orpc.obsControl.status.queryOptions({ input: { instanceId }, refetchInterval: 15_000, staleTime: 5_000 })
  );
  const status = statusQuery.data ?? null;
  const connected = obs.connection === "connected";
  const isExecutor = Boolean(status?.executorOnline && status.executorId === executorId);
  const executed = useRef(new Set<string>());
  const liveRef = useRef({ isExecutor, connected });
  liveRef.current = { isExecutor, connected };

  const setStatus = useCallback(
    (next: ObsStatus) => queryClient.setQueryData<ObsStatus>(statusKey, next),
    [queryClient, statusKey]
  );

  const claim = useMutation(orpc.obsControl.claim.mutationOptions({ onSuccess: setStatus }));
  const release = useMutation(orpc.obsControl.release.mutationOptions({ onSuccess: setStatus }));
  const report = useMutation(orpc.obsControl.report.mutationOptions({ onSuccess: setStatus }));
  const ack = useMutation(orpc.obsControl.ack.mutationOptions());
  const { mutate: claimSeat } = claim;
  const { mutate: releaseSeat } = release;
  const { mutate: sendReport } = report;
  const { mutate: sendAck } = ack;

  const run = useCallback(
    async (command: SerializedCommand) => {
      if (executed.current.has(command.id)) return;
      executed.current.add(command.id);
      try {
        await getObsClient().execute({ type: command.type, payload: command.payload } as Command);
        sendAck({ id: command.id, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error";
        sendAck({ id: command.id, ok: false, error: message });
        toast.error(`No se pudo ejecutar ${command.type}`, message);
      }
    },
    [sendAck]
  );

  const drain = useCallback(async () => {
    try {
      const pending = await rpc.obsControl.pending({ instanceId });
      for (const command of pending) await run(command);
    } catch (error) {
      console.error("❌ [OBS] Could not drain pending commands:", error);
    }
  }, [instanceId, run]);

  const { isConnected: busOpen } = useRealtimeChannel(obsControlChannel(instanceId), (event, payload) => {
    if (event === "status") setStatus(payload as ObsStatus);
    else if (event === "cues") queryClient.setQueryData<Cue[]>(cuesKey, payload as Cue[]);
    else if (event === "command" && liveRef.current.isExecutor && liveRef.current.connected)
      void run(payload as SerializedCommand);
  });

  // Take the seat when it is free (or stale) and we are the ones connected to OBS.
  const seatFree = Boolean(status && (!status.executorOnline || status.executorId === executorId));
  useEffect(() => {
    if (connected && seatFree && !isExecutor) claimSeat({ instanceId, executorId, force: false });
  }, [connected, seatFree, isExecutor, claimSeat, instanceId, executorId]);

  // Whatever queued while the bus was down runs now (stale ones are skipped server-side).
  useEffect(() => {
    if (isExecutor && connected && busOpen) void drain();
  }, [isExecutor, connected, busOpen, drain]);

  // Report OBS truth: debounced on change, every HEARTBEAT_MS regardless.
  const reportNow = useCallback(() => {
    const state = getObsClient().getSnapshot();
    sendReport({
      instanceId,
      executorId,
      status: {
        connected: state.connection === "connected",
        programScene: state.program || null,
        previewScene: state.studioMode ? state.preview || null : null,
        studioMode: state.studioMode,
        transitionName: state.transition || null,
        transitionMs: state.transitionMs,
        streaming: state.streaming,
        recording: state.recording,
        lastError: state.error,
        scenes: state.scenes,
        audioInputs: state.inputs.map((input) => ({ name: input.name, muted: input.muted })),
      },
    });
  }, [instanceId, executorId, sendReport]);

  useEffect(() => {
    if (!isExecutor) return;
    const timer = setTimeout(reportNow, REPORT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    isExecutor,
    reportNow,
    obs.connection,
    obs.program,
    obs.preview,
    obs.studioMode,
    obs.transition,
    obs.transitionMs,
    obs.streaming,
    obs.recording,
    obs.error,
    obs.scenes,
    obs.inputs,
  ]);

  useEffect(() => {
    if (!isExecutor) return;
    const timer = setInterval(reportNow, HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [isExecutor, reportNow]);

  // Lost OBS for good (not a retry): give the seat up so another connected tab takes it now.
  useEffect(() => {
    if (isExecutor && obs.connection === "disconnected") releaseSeat({ instanceId, executorId });
  }, [isExecutor, obs.connection, releaseSeat, instanceId, executorId]);

  useEffect(() => {
    const onHide = () => {
      if (!liveRef.current.isExecutor) return;
      void fetch(`/api/obs/release/${executorId}?instance=${instanceId}`, { method: "POST", keepalive: true });
    };
    window.addEventListener("pagehide", onHide);

    return () => window.removeEventListener("pagehide", onHide);
  }, [executorId, instanceId]);

  const takeControl = useCallback(() => {
    if (!connected) {
      toast.error("Conectate a OBS primero", "Solo una pestaña conectada a OBS puede ejecutar.");

      return;
    }
    claimSeat({ instanceId, executorId, force: true });
  }, [connected, claimSeat, instanceId, executorId]);

  return { status, isExecutor, executorId, busOpen, takeControl, reportNow };
}

/**
 * The loop: the executor advances the queue every N seconds and puts each
 * scene on program; other tabs only watch the shared index.
 */
export function useObsLoop({
  enabled,
  isPlaying,
  items,
  currentItemIndex,
  setCurrentItemIndex,
}: {
  enabled: boolean;
  isPlaying: boolean;
  items: { sceneName: string; delay: number }[];
  currentItemIndex: number;
  setCurrentItemIndex: (index: number) => void;
}) {
  const [remaining, setRemaining] = useState(0);
  const item = items[currentItemIndex] ?? items[0];
  const sceneName = item?.sceneName;
  const delay = item?.delay ?? 0;
  const count = items.length;
  const advance = useRef(setCurrentItemIndex);
  advance.current = setCurrentItemIndex;

  useEffect(() => {
    if (!enabled || !isPlaying || !sceneName || count === 0) {
      setRemaining(0);

      return;
    }
    getObsClient()
      .setProgram(sceneName)
      .catch(() => undefined);
    let left = delay;
    setRemaining(left);
    const timer = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setRemaining(left);

        return;
      }
      const next = (currentItemIndex + 1) % count;
      if (next === currentItemIndex) {
        // Single item: nothing to switch to, just restart the countdown.
        left = delay;
        setRemaining(left);

        return;
      }
      setRemaining(0);
      advance.current(next);
    }, 1_000);

    return () => clearInterval(timer);
  }, [enabled, isPlaying, sceneName, delay, count, currentItemIndex]);

  return remaining;
}
