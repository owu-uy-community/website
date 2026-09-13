"use client";

import { useEffect, useState } from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import { OWY_STAGE_CHANNEL, type InputEvent, type StageInput } from "lib/owy-stage/scenes";

/**
 * Everything the phones sent during `round`: the stored rows on mount, then
 * live events. `single`/`once` keys keep one row per voter; `multi` appends.
 */
export function useInputs(round: string, live = true): StageInput[] {
  return useInputsWithStatus(round, live).inputs;
}

/** Same, plus whether the stored rows have arrived (so live arrivals can be told from the backlog). */
export function useInputsWithStatus(round: string, live = true): { inputs: StageInput[]; loaded: boolean } {
  const [inputs, setInputs] = useState<StageInput[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setInputs([]);
    setLoaded(false);
    if (!round) return;
    client.owyStage
      .inputs({ round })
      .then(setInputs)
      .catch(() => setInputs([]))
      .finally(() => setLoaded(true));
  }, [round]);

  useRealtimeChannel(live && round ? OWY_STAGE_CHANNEL : null, (event, payload) => {
    if (event !== "input") return;
    const input = payload as InputEvent;
    if (input.round !== round) return;
    setInputs((list) => {
      const rest =
        input.mode === "multi" ? list : list.filter((i) => !(i.key === input.key && i.voter === input.voter));
      if (rest.some((i) => i.id === input.id)) return list;
      return [
        ...rest,
        { id: input.id, key: input.key, value: input.value, voter: input.voter, createdAt: input.createdAt },
      ];
    });
  });

  return { inputs, loaded };
}

/** Counts of `value` for one key, most voted first. */
export function tally(inputs: StageInput[], key: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const input of inputs) if (input.key === key) counts.set(input.value, (counts.get(input.value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Where phones go to participate — the wall's own origin, so it works on any deploy. */
export function usePlayUrl(): string {
  const [url, setUrl] = useState("https://owu.uy/owy/play");
  useEffect(() => {
    setUrl(`${window.location.origin}/owy/play`);
  }, []);
  return url;
}

const VOTER_KEY = "owy-voter";

/** A random id the phone keeps, so "one vote per person" means one per browser. */
export function useVoterId(): string {
  const [id, setId] = useState("");
  useEffect(() => {
    let stored = window.localStorage.getItem(VOTER_KEY);
    if (!stored) {
      stored = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      window.localStorage.setItem(VOTER_KEY, stored);
    }
    setId(stored);
  }, []);
  return id;
}
