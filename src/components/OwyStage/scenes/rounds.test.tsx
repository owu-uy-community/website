import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SCENES } from "lib/owy-stage/scenes";

import { Rounds } from "./service";

vi.mock(import("next/font/google"), () => {
  const font = () => ({ className: "", style: { fontFamily: "" }, variable: "" });
  return { Geist_Mono: font, Inter: font, Open_Sans: font, Poppins: font, Press_Start_2P: font } as never;
});

describe("rounds scene", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 16:49:00 in Montevideo (UTC-3), inside the 16:40–17:05 round.
    vi.setSystemTime(new Date("2026-11-07T19:49:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  test("the clock ticks every second, not once a minute", () => {
    const params = SCENES.rounds.params.parse({ rounds: "16:40-17:05" });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Rounds eventId={null} params={params} round="" takenAt="" />
      </QueryClientProvider>
    );
    expect(screen.getByText("16:00")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("15:59")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("15:29")).toBeInTheDocument();
  });
});
