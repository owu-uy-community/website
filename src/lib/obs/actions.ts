"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc/client";
import type { Command } from "lib/orpc/obs-control/schemas";
import type { ObsStatus } from "lib/orpc/obs-control/services";

import { getObsClient, useObs, type ObsState, type TransitionOptions } from "./client";

/**
 * One view of OBS for the page: the tab's own socket when it has one,
 * otherwise what the executor reports (so a phone with no route to OBS still
 * shows what is on air), and one set of actions that go straight to OBS or
 * through the command bus accordingly.
 */
export interface ObsView {
  /** Where the data comes from: our socket, the executor's report, or nothing. */
  source: "local" | "remote" | "none";
  connected: boolean;
  scenes: string[];
  program: string;
  preview: string;
  studioMode: boolean;
  transitions: string[];
  transition: string;
  transitionMs: number;
  transitioning: boolean;
  inputs: { name: string; muted: boolean; volumeDb: number | null }[];
  streaming: boolean;
  recording: boolean;
  pending: ObsState["pending"];
}

export function useObsView(instanceId = 1): { obs: ObsState; status: ObsStatus | null; view: ObsView } {
  const obs = useObs();
  const { data: status = null } = useQuery(
    orpc.obsControl.status.queryOptions({ input: { instanceId }, refetchInterval: 15_000, staleTime: 5_000 })
  );
  const local = obs.connection === "connected";
  const remote = !local && Boolean(status?.executorOnline && status.connected);

  const view = useMemo<ObsView>(() => {
    if (local) {
      return {
        source: "local",
        connected: true,
        scenes: obs.scenes,
        program: obs.program,
        preview: obs.preview,
        studioMode: obs.studioMode,
        transitions: obs.transitions,
        transition: obs.transition,
        transitionMs: obs.transitionMs,
        transitioning: obs.transitioning,
        inputs: obs.inputs,
        streaming: obs.streaming,
        recording: obs.recording,
        pending: obs.pending,
      };
    }
    if (remote && status) {
      return {
        source: "remote",
        connected: true,
        scenes: status.scenes,
        program: status.programScene ?? "",
        preview: status.previewScene ?? "",
        studioMode: status.studioMode,
        transitions: status.transitionName ? [status.transitionName] : [],
        transition: status.transitionName ?? "",
        transitionMs: status.transitionMs ?? 0,
        transitioning: false,
        inputs: status.audioInputs.map((input) => ({ ...input, volumeDb: null })),
        streaming: status.streaming,
        recording: status.recording,
        pending: {},
      };
    }

    return {
      source: "none",
      connected: false,
      scenes: [],
      program: "",
      preview: "",
      studioMode: false,
      transitions: [],
      transition: "",
      transitionMs: 0,
      transitioning: false,
      inputs: [],
      streaming: false,
      recording: false,
      pending: {},
    };
  }, [local, remote, obs, status]);

  return { obs, status, view };
}

const fail = (title: string) => (error: unknown) =>
  toast.error(title, error instanceof Error ? error.message : undefined);

export function useObsActions(instanceId = 1) {
  const obs = useObs();
  const local = obs.connection === "connected";
  const send = useMutation(orpc.obsControl.send.mutationOptions());
  const { mutateAsync } = send;

  const remote = useCallback(
    async (command: Command) => {
      const sent = await mutateAsync({ instanceId, ...command });
      if (!sent.executorOnline) toast.error("Nadie está conectado a OBS", "El comando queda en cola 30 s.");
    },
    [instanceId, mutateAsync]
  );

  return useMemo(() => {
    const client = getObsClient();
    const run = (title: string, localFn: () => Promise<void>, command: Command) =>
      (local ? localFn() : remote(command)).catch(fail(title));

    return {
      local,
      setProgram: (sceneName: string, options: TransitionOptions = {}) =>
        run("No se pudo poner al aire", () => client.setProgram(sceneName, options), {
          type: "scene",
          payload: { sceneName, ...options },
        }),
      setPreview: (sceneName: string) =>
        run("No se pudo poner en preview", () => client.setPreview(sceneName), {
          type: "preview",
          payload: { sceneName },
        }),
      take: () => run("No se pudo hacer TAKE", () => client.take(), { type: "take", payload: {} }),
      cut: () => run("No se pudo hacer CUT", () => client.cut(), { type: "cut", payload: {} }),
      setStudioMode: (enabled: boolean) =>
        run("No se pudo cambiar el modo", () => client.setStudioMode(enabled), {
          type: "studio",
          payload: { enabled },
        }),
      setTransition: (name?: string, durationMs?: number) =>
        run("No se pudo cambiar la transición", () => client.setTransition(name, durationMs), {
          type: "transition",
          payload: { name, durationMs },
        }),
      setMute: (inputName: string, muted?: boolean) =>
        run("No se pudo mutear", () => client.setMute(inputName, muted), {
          type: "mute",
          payload: { inputName, muted },
        }),
      setVolume: (inputName: string, db: number) =>
        run("No se pudo cambiar el volumen", () => client.setVolume(inputName, db), {
          type: "volume",
          payload: { inputName, db },
        }),
      setStream: (action: "start" | "stop" | "toggle") =>
        run("No se pudo cambiar el stream", () => client.setStream(action), { type: "stream", payload: { action } }),
      setRecord: (action: "start" | "stop" | "toggle") =>
        run("No se pudo cambiar la grabación", () => client.setRecord(action), {
          type: "record",
          payload: { action },
        }),
    };
  }, [local, remote]);
}

export type ObsActions = ReturnType<typeof useObsActions>;
