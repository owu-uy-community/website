"use client";

/**
 * Drop-in replacement for the slice of the Supabase Realtime API this app
 * uses (`supabase.channel(...)` broadcast channels), backed by the native
 * WebSocket transport. Lets every existing hook switch transports without
 * call-site changes; new code should prefer useRealtimeChannel /
 * getRealtimeClient directly.
 */

import { getRealtimeClient } from "./client";

// Supabase's channel API is loosely typed (callbacks destructure `{ payload }`
// with their own shape), so the facade mirrors that looseness on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BroadcastCallback = (message: { event: string; payload: any }) => void;

type ChannelConfig = {
  config?: {
    broadcast?: {
      self?: boolean;
    };
  };
};

export type CompatChannel = {
  name: string;
  on: (type: "broadcast", filter: { event: string }, callback: BroadcastCallback) => CompatChannel;
  subscribe: (statusCallback?: (status: string) => void) => CompatChannel;
  send: (message: { type: "broadcast"; event: string; payload: unknown }) => Promise<"ok">;
  unsubscribe: () => Promise<"ok">;
};

class RealtimeCompatClient {
  private channels = new Map<string, { channel: CompatChannel; teardown: () => void }>();

  channel(name: string, options?: ChannelConfig): CompatChannel {
    const existing = this.channels.get(name);
    if (existing) return existing.channel;

    const client = getRealtimeClient();
    const receiveSelf = options?.config?.broadcast?.self ?? false;
    const listeners = new Map<string, Set<BroadcastCallback>>();
    let unsubscribe: (() => void) | null = null;
    let statusCallback: ((status: string) => void) | undefined;

    const channel: CompatChannel = {
      name,
      on(_type, filter, callback) {
        let set = listeners.get(filter.event);
        if (!set) {
          set = new Set();
          listeners.set(filter.event, set);
        }
        set.add(callback);

        return channel;
      },
      subscribe(callback) {
        statusCallback = callback;
        unsubscribe ??= client.subscribe(name, (event, payload, senderId) => {
          if (!receiveSelf && senderId === client.senderId) return;
          const set = listeners.get(event);
          if (!set) return;
          for (const listener of set) listener({ event, payload });
        });
        // The underlying client connects lazily; report through status changes.
        statusCallback?.(client.getStatus() === "open" ? "SUBSCRIBED" : "CONNECTING");
        const offStatus = client.onStatusChange((status) => {
          statusCallback?.(status === "open" ? "SUBSCRIBED" : status === "connecting" ? "CONNECTING" : "CLOSED");
        });
        const baseTeardown = unsubscribe;
        unsubscribe = () => {
          offStatus();
          baseTeardown?.();
        };

        return channel;
      },
      async send(message) {
        client.publish(name, message.event, message.payload);

        return "ok" as const;
      },
      async unsubscribe() {
        unsubscribe?.();
        unsubscribe = null;

        return "ok" as const;
      },
    };

    this.channels.set(name, {
      channel,
      teardown: () => {
        void channel.unsubscribe();
      },
    });

    return channel;
  }

  removeChannel(channel: CompatChannel): void {
    const entry = this.channels.get(channel.name);
    if (!entry) return;
    entry.teardown();
    this.channels.delete(channel.name);
  }
}

export const realtimeCompat = new RealtimeCompatClient();
