import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SCENES } from "lib/owy-stage/scenes";

import { CoffeeBreak } from "./service";

vi.mock(import("next/font/google"), () => {
  const font = () => ({ className: "", style: { fontFamily: "" }, variable: "" });
  return { Geist_Mono: font, Inter: font, Open_Sans: font, Poppins: font, Press_Start_2P: font } as never;
});

describe("coffee break scene", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 18:40:00 in Montevideo (UTC-3), inside the break.
    vi.setSystemTime(new Date("2026-11-07T21:40:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  test("counts down every second to the rescheduled talks and stops at zero", () => {
    // The talks slipped from 19:00 to 19:10.
    const params = SCENES.coffee.params.parse({ breakAt: "18:25", talksAt: "19:10", note: "Primera charla" });
    render(<CoffeeBreak eventId={null} params={params} round="" takenAt="" />);
    expect(screen.getByText("30:00")).toBeInTheDocument();
    expect(screen.getByText("19:10 · Primera charla")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("29:59")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30 * 60_000));
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });
});
