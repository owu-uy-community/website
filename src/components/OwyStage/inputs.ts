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

export const PIXEL_SIZE = 16;
export const PIXEL_COLORS = ["transparent", "#F5BB03", "#0162C8", "#FBF5E7"];

/** 16×16 cells with 4 colours → 2 bits each → 64 bytes → 88 chars of base64 (fits a 140-char value). */
export function encodePixels(cells: number[]): string {
  let bytes = "";
  for (let i = 0; i < PIXEL_SIZE * PIXEL_SIZE; i += 4) {
    bytes += String.fromCharCode(
      ((cells[i] & 3) << 6) | ((cells[i + 1] & 3) << 4) | ((cells[i + 2] & 3) << 2) | (cells[i + 3] & 3)
    );
  }
  return btoa(bytes);
}

export function decodePixels(value: string): number[] {
  const cells: number[] = [];
  try {
    for (const ch of atob(value)) {
      const b = ch.charCodeAt(0);
      cells.push((b >> 6) & 3, (b >> 4) & 3, (b >> 2) & 3, b & 3);
    }
  } catch {
    return [];
  }
  return cells.length === PIXEL_SIZE * PIXEL_SIZE ? cells : [];
}

/** Seconds since the take, from the server's timestamp (so wall and phones agree). */
export function useElapsed(takenAt: string, tick = 250): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = takenAt ? new Date(takenAt).getTime() : Date.now();
    const update = () => setElapsed(Math.max(0, (Date.now() - start) / 1000));
    update();
    const id = setInterval(update, tick);
    return () => clearInterval(id);
  }, [takenAt, tick]);
  return elapsed;
}

export type RaceQuestion = { question: string; options: string[]; answer: number };

/** "¿Q?: a, b, c, d = 2 | …" */
export function parseRace(value: string): RaceQuestion[] {
  return value
    .split("|")
    .map((line) => {
      const eq = line.lastIndexOf("=");
      const colon = line.indexOf(":");
      if (eq < 0 || colon < 0 || colon > eq) return null;
      const options = line
        .slice(colon + 1, eq)
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      const answer = Number(line.slice(eq + 1).trim());
      if (options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
      return { question: line.slice(0, colon).trim(), options, answer };
    })
    .filter((q): q is RaceQuestion => q !== null);
}

export const RACE_REVEAL = 7;
