import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { CountdownState } from "lib/orpc/countdown/schemas";
import { server } from "test/msw/server";
import { api } from "test/orpc-msw";

import { useCountdownState } from "./useCountdownState";

/** What the hook subscribed to, so a test can deliver a realtime message. */
const listeners = new Map<string, (event: string, payload: unknown) => void>();
vi.mock(import("./useRealtimeChannel"), () => ({
  useRealtimeChannel: vi.fn<typeof import("./useRealtimeChannel").useRealtimeChannel>((channel, onMessage) => {
    if (channel) listeners.set(channel, onMessage);

    return { publish: () => undefined, status: "open", isConnected: true };
  }),
}));

const stopped: CountdownState = {
  isRunning: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  lastUpdated: "2026-11-07T18:00:00.000Z",
  soundEnabled: false,
};

function setup(onServer: CountdownState) {
  server.use(api.countdown.getState.handler(() => onServer));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useCountdownState({ eventId: "evento-1" }), { wrapper });
}

describe(useCountdownState, () => {
  test("an admin's change reaches the screen as it happens, then the screen ticks on its own", async () => {
    const { result } = setup(stopped);
    await waitFor(() => expect(result.current.state.lastUpdated).toBe(stopped.lastUpdated));

    act(() => {
      listeners.get("event:evento-1:countdown")?.("countdown_state_change", {
        ...stopped,
        isRunning: true,
        remainingSeconds: 300,
        totalSeconds: 300,
        targetTime: new Date(Date.now() + 300_000).toISOString(),
      });
    });
    await waitFor(() => expect(result.current.state.isRunning).toBe(true));
    const first = result.current.state.remainingSeconds;

    expect(first).toBeGreaterThan(298);
    await waitFor(() => expect(result.current.state.remainingSeconds).toBeLessThan(first), { timeout: 2_500 });
  });

  test("a countdown whose time is up reads as stopped at zero", async () => {
    const { result } = setup({
      ...stopped,
      isRunning: true,
      remainingSeconds: 300,
      totalSeconds: 300,
      targetTime: new Date(Date.now() - 1_000).toISOString(),
    });

    await waitFor(() => expect(result.current.state.totalSeconds).toBe(300));
    expect(result.current.state).toMatchObject({ isRunning: false, remainingSeconds: 0, targetTime: undefined });
  });
});
