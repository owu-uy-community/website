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
    // 18:40:00 in Montevideo (UTC-3), inside the 18:25–19:00 break.
    vi.setSystemTime(new Date("2026-11-07T21:40:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  test("counts down every second to the end of the break and stops at zero", () => {
    const params = SCENES.coffee.params.parse({ start: "18:25", until: "19:00" });
    render(<CoffeeBreak eventId={null} params={params} round="" takenAt="" />);
    expect(screen.getByText("20:00")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("19:59")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(20 * 60_000));
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });
});
