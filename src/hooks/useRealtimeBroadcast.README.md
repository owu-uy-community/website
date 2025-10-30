# useRealtimeBroadcast Hook

A generic, reusable hook for managing Supabase real-time broadcasts with automatic query invalidation and zero boilerplate.

## Features

✅ **Zero Boilerplate** - No more useEffect, channel creation, or cleanup code  
✅ **Type-Safe** - Full TypeScript support with generic payloads  
✅ **Auto Cleanup** - Handles channel subscription and unsubscription automatically  
✅ **Query Integration** - Built-in React Query cache invalidation  
✅ **Debug Mode** - Optional console logging for development  
✅ **Multiple Events** - Listen to multiple events on a single channel  
✅ **Self-Filter** - Option to receive/ignore own broadcasts  

---

## Basic Usage

### Simple Broadcasting

```tsx
import { useRealtimeBroadcast } from "hooks/useRealtimeBroadcast";

function MyComponent() {
  const { broadcast, invalidate } = useRealtimeBroadcast({
    channelName: "my-feature",
    eventHandlers: [
      {
        event: "data_updated",
        onReceive: (payload) => {
          console.log("Received update:", payload);
          // Invalidate related queries
          invalidate(["myData", payload.id]);
        },
      },
    ],
  });

  const handleUpdate = async () => {
    // Update your data...
    
    // Broadcast to other clients
    await broadcast("data_updated", { id: "123", value: "new" });
  };

  return <button onClick={handleUpdate}>Update</button>;
}
```

---

## Advanced Usage

### With Automatic Query Invalidation

```tsx
import { useRealtimeBroadcastWithInvalidation } from "hooks/useRealtimeBroadcast";

function TodoList() {
  const { broadcastAndInvalidate } = useRealtimeBroadcastWithInvalidation({
    channelName: "todos",
    eventHandlers: [
      {
        event: "todo_created",
        queryKey: ["todos"], // Auto-invalidates this query
      },
      {
        event: "todo_updated",
        queryKey: (payload) => ["todos", payload.id], // Dynamic query key
      },
    ],
  });

  const createTodo = async (todo) => {
    const result = await api.createTodo(todo);
    
    // This broadcasts AND invalidates the query automatically
    await broadcastAndInvalidate("todo_created", result);
  };

  return <div>...</div>;
}
```

---

## Real-World Examples

### Example 1: Schedule Highlighting (from OpenSpace Admin)

**Before (58 lines with boilerplate):**
```tsx
// ❌ Old way - lots of boilerplate
useEffect(() => {
  const channel = supabase.channel("openspace-schedule-highlights", {
    config: {
      broadcast: { self: false },
    },
  });

  channel.on("broadcast", { event: "highlight_changed" }, ({ payload }) => {
    console.log("Received:", payload);
    queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
  });

  channel.on("broadcast", { event: "auto_highlight_changed" }, ({ payload }) => {
    console.log("Received:", payload);
    queryClient.invalidateQueries({ queryKey: ["openSpace", OPENSPACE_ID] });
  });

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [queryClient]);

// Broadcasting also requires boilerplate
const broadcast = async () => {
  try {
    const globalChannel = supabase.channel("openspace-schedule-highlights");
    await globalChannel.send({
      type: "broadcast",
      event: "highlight_changed",
      payload: { ... },
    });
    console.log("Broadcasted");
  } catch (error) {
    console.error("Failed:", error);
  }
};
```

**After (11 lines, clean and reusable):**
```tsx
// ✅ New way - clean and simple
const { broadcast } = useRealtimeBroadcastWithInvalidation({
  channelName: "openspace-schedule-highlights",
  eventHandlers: [
    {
      event: "highlight_changed",
      queryKey: orpc.schedules.getByOpenSpace.key(),
    },
    {
      event: "auto_highlight_changed",
      queryKey: ["openSpace", OPENSPACE_ID],
    },
  ],
  receiveSelf: false,
  debug: true,
});

// Broadcasting is now one line
await broadcast("highlight_changed", { scheduleId: "123", highlighted: true });
```

---

### Example 2: Kiosk Display Updates

```tsx
function KioskMap() {
  // Listen for updates and invalidate queries automatically
  const { invalidate } = useRealtimeBroadcast({
    channelName: "openspace-schedule-highlights",
    eventHandlers: [
      {
        event: "highlight_changed",
        onReceive: () => {
          invalidate(HIGHLIGHTED_TRACKS_KEY);
        },
      },
    ],
    receiveSelf: false,
    debug: true,
  });

  // That's it! No cleanup, no channel management
  return <Map />;
}
```

---

### Example 3: Multi-Device Chat

```tsx
function Chat() {
  const { broadcast, isConnected } = useRealtimeBroadcast({
    channelName: `chat-room-${roomId}`,
    eventHandlers: [
      {
        event: "message",
        onReceive: (payload) => {
          addMessageToUI(payload);
        },
      },
      {
        event: "user_typing",
        onReceive: (payload) => {
          showTypingIndicator(payload.username);
        },
      },
    ],
    debug: process.env.NODE_ENV === "development",
  });

  const sendMessage = async (text) => {
    await broadcast("message", {
      id: Date.now(),
      text,
      username: currentUser,
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div>
      {!isConnected && <Badge>Offline</Badge>}
      <MessageList />
      <SendButton onClick={sendMessage} />
    </div>
  );
}
```

---

## API Reference

### `useRealtimeBroadcast`

The base hook for managing real-time broadcasts.

#### Parameters

```typescript
interface RealtimeBroadcastConfig {
  /** Unique channel name for this broadcast */
  channelName: string;
  
  /** Array of event handlers to listen to */
  eventHandlers: EventHandler[];
  
  /** Whether to receive own broadcasts (default: false) */
  receiveSelf?: boolean;
  
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

interface EventHandler<T = any> {
  event: string;
  onReceive: (payload: T) => void;
}
```

#### Returns

```typescript
interface RealtimeBroadcastReturn {
  /** Broadcast an event to all connected clients */
  broadcast: <T = any>(event: string, payload: T) => Promise<void>;
  
  /** Check if channel is connected */
  isConnected: boolean;
  
  /** Manually invalidate query keys */
  invalidate: (queryKey: any[]) => Promise<void>;
}
```

---

### `useRealtimeBroadcastWithInvalidation`

Enhanced hook that automatically invalidates queries when events are received.

#### Parameters

```typescript
interface BroadcastWithInvalidationConfig {
  channelName: string;
  
  eventHandlers: Array<{
    event: string;
    queryKey: any[] | ((payload: any) => any[]);
  }>;
  
  receiveSelf?: boolean;
  debug?: boolean;
}
```

#### Returns

```typescript
interface Return {
  /** Broadcast an event */
  broadcast: <T = any>(event: string, payload: T) => Promise<void>;
  
  /** Broadcast and auto-invalidate the associated query */
  broadcastAndInvalidate: <T = any>(event: string, payload: T) => Promise<void>;
  
  /** Manually invalidate query keys */
  invalidate: (queryKey: any[]) => Promise<void>;
  
  /** Connection status */
  isConnected: boolean;
}
```

---

## Best Practices

### 1. **Use Descriptive Channel Names**

```tsx
// ✅ Good - clear and specific
channelName: "openspace-schedule-highlights"
channelName: "chat-room-${roomId}"
channelName: "user-${userId}-notifications"

// ❌ Bad - too generic
channelName: "updates"
channelName: "channel1"
```

### 2. **Use Debug Mode During Development**

```tsx
const { broadcast } = useRealtimeBroadcast({
  channelName: "my-feature",
  eventHandlers: [...],
  debug: process.env.NODE_ENV === "development", // Only in dev
});
```

### 3. **Handle Errors Gracefully**

```tsx
const handleUpdate = async () => {
  try {
    await broadcast("update", data);
    toast.success("Updated!");
  } catch (error) {
    console.error("Broadcast failed:", error);
    toast.error("Failed to sync with other devices");
  }
};
```

### 4. **Use Dynamic Query Keys When Needed**

```tsx
eventHandlers: [
  {
    event: "item_updated",
    queryKey: (payload) => ["items", payload.itemId], // ✅ Dynamic
  },
]
```

---

## Performance Tips

1. **Avoid Receiving Self**
   - Set `receiveSelf: false` to prevent processing your own broadcasts
   
2. **Debounce High-Frequency Events**
   ```tsx
   const debouncedInvalidate = useMemo(
     () => debounce((key) => invalidate(key), 500),
     [invalidate]
   );
   ```

3. **Use Specific Query Keys**
   - Invalidate only affected queries, not entire datasets

---

## Troubleshooting

### Events Not Received?

1. Check channel name matches on both sender and receiver
2. Verify Supabase credentials are correct
3. Enable `debug: true` to see console logs
4. Check network tab for WebSocket connection

### Query Not Invalidating?

1. Ensure query key format matches exactly
2. Check React Query DevTools to verify invalidation
3. Verify event handler is correctly configured

### Performance Issues?

1. Reduce number of invalidations
2. Use debouncing for high-frequency events
3. Consider using `receiveSelf: false`
4. Batch multiple updates together

---

## Migration Guide

### From Manual useEffect

**Before:**
```tsx
useEffect(() => {
  const channel = supabase.channel("my-channel");
  channel.on("broadcast", { event: "update" }, ({ payload }) => {
    queryClient.invalidateQueries({ queryKey: ["data"] });
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}, []);
```

**After:**
```tsx
useRealtimeBroadcastWithInvalidation({
  channelName: "my-channel",
  eventHandlers: [{ event: "update", queryKey: ["data"] }],
});
```

---

## TypeScript Examples

### Typed Payloads

```tsx
interface SchedulePayload {
  scheduleId: string;
  highlightInKiosk: boolean;
  timestamp: string;
}

const { broadcast } = useRealtimeBroadcast<SchedulePayload>({
  channelName: "schedules",
  eventHandlers: [
    {
      event: "schedule_updated",
      onReceive: (payload: SchedulePayload) => {
        console.log(payload.scheduleId); // ✅ Fully typed
      },
    },
  ],
});

// Type-safe broadcasting
await broadcast<SchedulePayload>("schedule_updated", {
  scheduleId: "123",
  highlightInKiosk: true,
  timestamp: new Date().toISOString(),
});
```

---

## Testing

```tsx
import { renderHook, waitFor } from "@testing/library/react";
import { useRealtimeBroadcast } from "hooks/useRealtimeBroadcast";

test("broadcasts and receives events", async () => {
  const onReceive = jest.fn();
  
  const { result } = renderHook(() =>
    useRealtimeBroadcast({
      channelName: "test",
      eventHandlers: [{ event: "test_event", onReceive }],
      receiveSelf: true, // Receive own broadcasts for testing
    })
  );

  await result.current.broadcast("test_event", { data: "test" });
  
  await waitFor(() => {
    expect(onReceive).toHaveBeenCalledWith({ data: "test" });
  });
});
```

---

## Related Hooks

- `useSupabaseSync` - Legacy hook for OpenSpace cards (consider migrating)
- `useCountdownState` - Countdown timer with real-time sync
- `useOpenSpaceNotesORPC` - OpenSpace notes with real-time updates

---

## License

MIT

