"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { OWY_STAGE_CHANNEL, parseSceneParams, type SceneParams, type StageState } from "lib/owy-stage/scenes";
import { stepAfter, stepBefore, type TalkPosition } from "lib/owy-stage/talk/deck";

export type TalkParams = SceneParams<"owy-charla">;
export type Overlay = "blank" | "owy" | "qr";
/** What the console switches on the wall: the overlays, and Owy's subtitles (on by default). */
export type WallToggle = Overlay | "captions";

const stateKey = () => orpc.owyStage.getState.queryKey();

/**
 * The talk as the wall shows it: the deck position lives in the `owy-charla` scene's params, so
 * the laptop and the phone drive the same slide. Moves are params edits of the same scene (the
 * phone round survives); this console never puts another scene on air.
 */
export function useTalkStage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(orpc.owyStage.getState.queryOptions());
  const live = data ?? null;
  const liveRef = useRef(live);
  liveRef.current = live;
  /** Moves still on their way: their broadcasts would rewind the cache under a fast clicker. */
  const inflight = useRef(0);
  const latest = useRef(0);

  useRealtimeChannel(OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "scene" && inflight.current === 0) queryClient.setQueryData(stateKey(), payload as StageState);
  });

  const setScene = useMutation(orpc.owyStage.setScene.mutationOptions());
  const mutate = useRef(setScene.mutateAsync);
  mutate.current = setScene.mutateAsync;

  /** Changes the talk's params; the cache moves first, so presses chain without waiting. */
  const put = useCallback(
    (next: Partial<TalkParams>) => {
      const current = liveRef.current;
      if (current?.scene !== "owy-charla") return;
      const params = { ...parseSceneParams("owy-charla", current.params), ...next };
      const optimistic: StageState = { ...current, params };
      liveRef.current = optimistic;
      queryClient.setQueryData(stateKey(), optimistic);
      const mine = ++latest.current;
      inflight.current += 1;
      mutate
        .current({ scene: "owy-charla", params })
        .then((state) => {
          if (mine === latest.current) queryClient.setQueryData(stateKey(), state);
        })
        .catch((error: Error) => {
          toast.error("No se pudo mover la charla", error.message);
          void queryClient.invalidateQueries({ queryKey: stateKey() });
        })
        .finally(() => {
          inflight.current -= 1;
        });
    },
    [queryClient]
  );

  const onTalk = live?.scene === "owy-charla";
  const params: TalkParams | null = onTalk ? parseSceneParams("owy-charla", live.params) : null;
  const position: TalkPosition | null = params ? { slide: params.slide, step: params.step } : null;

  /** A slide change clears the Q&A focus: who answers is about the question on screen. */
  const go = useCallback(
    (to: TalkPosition) => {
      const current = liveRef.current;
      const slide = current?.scene === "owy-charla" ? parseSceneParams("owy-charla", current.params).slide : null;
      put({ slide: to.slide, step: to.step, ...(to.slide !== slide ? { who: "", focus: "" } : {}) });
    },
    [put]
  );
  const move = useCallback(
    (direction: 1 | -1) => {
      const current = liveRef.current;
      if (current?.scene !== "owy-charla") return;
      const { slide, step } = parseSceneParams("owy-charla", current.params);
      const to = direction === 1 ? stepAfter({ slide, step }) : stepBefore({ slide, step });
      if (to) go(to);
    },
    [go]
  );
  const toggle = useCallback(
    (what: WallToggle) => {
      const current = liveRef.current;
      if (current?.scene !== "owy-charla") return;
      put({ [what]: !parseSceneParams("owy-charla", current.params)[what] });
    },
    [put]
  );

  /** From whatever the wall shows to the lobby: the first take starts the talk's one phone round. */
  const start = useCallback(() => {
    void mutate
      .current({ scene: "owy-charla", params: { slide: "lobby" } })
      .then((state) => queryClient.setQueryData(stateKey(), state))
      .catch((error: Error) => toast.error("No se pudo empezar la charla", error.message));
  }, [queryClient]);

  const confetti = useMutation(
    orpc.owyStage.fireEffect.mutationOptions({
      onError: (error) => toast.error("No salió el confetti", error.message),
    })
  );

  return {
    live,
    loading: isPending,
    onTalk,
    params,
    position,
    round: onTalk ? live.round : "",
    put,
    go,
    next: useCallback(() => move(1), [move]),
    prev: useCallback(() => move(-1), [move]),
    toggle,
    start,
    confetti: useCallback(() => confetti.mutate({ effect: "confetti" }), [confetti]),
  };
}

const readJson = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full: the clock still runs for this visit.
  }
};

export type SlideVisit = { slide: string; at: number };

/**
 * The talk clock, per phone round (so a rehearsal and the real talk don't mix): it starts the
 * first time the deck leaves the lobby. Every slide change is logged with its time for «Ensayo».
 */
export function useTalkClock(round: string, slide: string | null) {
  const [now, setNow] = useState(() => Date.now());
  const [startAt, setStartAt] = useState<number | null>(null);
  const [log, setLog] = useState<SlideVisit[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!round || !slide) return;
    const startKey = `owy-charla-start:${round}`;
    let started = readJson<number | null>(startKey, null);
    if (!started && slide !== "lobby") {
      started = Date.now();
      writeJson(startKey, started);
    }
    setStartAt(started);
    const logKey = `owy-charla-log:${round}`;
    const visits = readJson<SlideVisit[]>(logKey, []);
    if (visits.at(-1)?.slide !== slide) {
      visits.push({ slide, at: Date.now() });
      writeJson(logKey, visits.slice(-200));
    }
    setLog(visits);
  }, [round, slide]);

  const restart = useCallback(() => {
    if (!round) return;
    const at = Date.now();
    writeJson(`owy-charla-start:${round}`, at);
    writeJson(`owy-charla-log:${round}`, slide ? [{ slide, at }] : []);
    setStartAt(at);
    setLog(slide ? [{ slide, at }] : []);
  }, [round, slide]);

  return { now, startAt, elapsed: startAt ? Math.max(0, (now - startAt) / 1000) : 0, log, restart };
}

/** 754 → "12:34" (negative values keep their sign). */
export function clock(seconds: number) {
  const whole = Math.round(Math.abs(seconds));
  const text = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;

  return seconds < 0 ? `−${text}` : text;
}
