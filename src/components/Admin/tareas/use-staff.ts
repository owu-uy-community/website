"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";

import type { StaffAnnouncement, StaffArrival, StaffTask, StaffTaskStatus } from "./helpers";

/** A toast saying what just happened, with the way back: what a swipe does, since a swipe is easy to do by accident. */
export const undoable = (title: string, description: string, undo: () => void) =>
  toast.success({ title, description, duration: 6000, action: { label: "Deshacer", onClick: undo } });

/** The query keys of an event's staff data, for reads, invalidation and optimistic writes. */
export function staffKeys(eventId: string) {
  const input = { input: { eventId } };
  return {
    tasks: orpc.staffTasks.list.queryKey(input),
    announcements: orpc.staffTasks.announcements.list.queryKey(input),
    arrivals: orpc.staffTasks.arrivals.list.queryKey(input),
    onShift: orpc.staffTasks.onShift.queryKey(input),
  };
}

/**
 * Keep an event's staff data fresh: the staff channel pings on task and announcement changes,
 * the ops channel on arrivals. Pings carry no content; the data comes back through the reads.
 */
export function useStaffLive(eventId: string) {
  const queryClient = useQueryClient();
  const keys = staffKeys(eventId);
  const refresh = (...queryKeys: QueryKey[]) => {
    for (const queryKey of queryKeys) void queryClient.invalidateQueries({ queryKey });
  };

  useRealtimeChannel(eventChannel(eventId, "staff"), (event) => {
    if (event === "tasks_changed") refresh(keys.tasks, keys.announcements, keys.onShift);
    else if (event === "announcement_created") refresh(keys.announcements);
  });
  useRealtimeChannel(eventChannel(eventId, "ops"), (event) => {
    if (event === "arrivals") refresh(keys.arrivals, keys.onShift);
  });
}

/**
 * Mutation callbacks that apply a change to a cached list at once, put it back if the server
 * says no (with a toast saying why), and re-read the list when done.
 */
export function useOptimistic() {
  const queryClient = useQueryClient();

  return <T, I>(queryKey: QueryKey, apply: (current: T, input: I) => T, failure: string, also: QueryKey[] = []) => ({
    onMutate: async (input: I) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<T>(queryKey);
      if (previous !== undefined) queryClient.setQueryData<T>(queryKey, apply(previous, input));
      return { previous };
    },
    onError: (error: Error, _input: I, context: { previous?: T } | undefined) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous);
      toast.error(failure, error.message || "Probá de nuevo en un momento.");
    },
    onSettled: () => {
      for (const key of [queryKey, ...also]) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export const withTask = (tasks: StaffTask[], taskId: string, change: (task: StaffTask) => StaffTask) =>
  tasks.map((task) => (task.id === taskId ? change(task) : task));

/** My "recibido", shown before the server confirms it. */
export const ackedBy = (
  announcements: StaffAnnouncement[],
  announcementId: string,
  me: { id: string; name: string; image: string | null }
) =>
  announcements.map((announcement) =>
    announcement.id === announcementId && !announcement.ackedByMe
      ? {
          ...announcement,
          ackedByMe: true,
          ackCount: announcement.ackCount + 1,
          acks: [
            { userId: me.id, name: me.name, image: me.image, ackedAt: new Date().toISOString() },
            ...announcement.acks,
          ],
          pending: announcement.pending.filter((person) => person.userId !== me.id),
        }
      : announcement
  );

/** An arrival (or a departure) shown before the server confirms it. */
export const withArrival = (arrivals: StaffArrival[], arrival: StaffArrival) => [
  ...arrivals.filter((item) => item.userId !== arrival.userId),
  arrival,
];

export type Me = { id: string; name: string; image: string | null };

/** Start, finish, block or reopen a task, shown at once. */
export function useSetStatus(eventId: string) {
  const keys = staffKeys(eventId);
  const optimistic = useOptimistic();
  return useMutation(
    orpc.staffTasks.setStatus.mutationOptions(
      optimistic<StaffTask[], { taskId: string; status: StaffTaskStatus }>(
        keys.tasks,
        (tasks, { taskId, status }) => withTask(tasks, taskId, (task) => ({ ...task, status })),
        "No se pudo actualizar la tarea",
        [keys.onShift]
      )
    )
  );
}

/** Sign myself up for a task, or off it, shown at once. */
export function useMembership(eventId: string, me: Me) {
  const keys = staffKeys(eventId);
  const optimistic = useOptimistic();
  const change = (joining: boolean) =>
    optimistic<StaffTask[], { taskId: string }>(
      keys.tasks,
      (tasks, { taskId }) =>
        withTask(tasks, taskId, (task) => ({
          ...task,
          assignees: [
            ...task.assignees.filter((assignee) => assignee.userId !== me.id),
            ...(joining ? [{ userId: me.id, name: me.name, image: me.image, noShow: false }] : []),
          ],
        })),
      joining ? "No te pudimos sumar" : "No te pudimos bajar",
      [keys.onShift]
    );

  return {
    join: useMutation(orpc.staffTasks.join.mutationOptions(change(true))),
    leave: useMutation(orpc.staffTasks.leave.mutationOptions(change(false))),
  };
}

/** My "recibido" on an announcement, shown at once. */
export function useAck(eventId: string, me: Me) {
  const optimistic = useOptimistic();
  return useMutation(
    orpc.staffTasks.announcements.ack.mutationOptions(
      optimistic<StaffAnnouncement[], { announcementId: string }>(
        staffKeys(eventId).announcements,
        (announcements, { announcementId }) => ackedBy(announcements, announcementId, me),
        "No se pudo marcar como recibido"
      )
    )
  );
}

/** "Llegué" and "Salir del turno" for myself, shown at once. */
export function useMyArrival(eventId: string, me: Me) {
  const keys = staffKeys(eventId);
  const optimistic = useOptimistic();
  const change = (arriving: boolean) =>
    optimistic<StaffArrival[], unknown>(
      keys.arrivals,
      (arrivals) => {
        const now = new Date().toISOString();
        const current = arrivals.find((arrival) => arrival.userId === me.id);
        return withArrival(arrivals, {
          userId: me.id,
          name: me.name,
          image: me.image,
          arrivedAt: arriving && (!current || current.leftAt) ? now : (current?.arrivedAt ?? now),
          leftAt: arriving ? null : now,
        });
      },
      arriving ? "No se pudo marcar tu llegada" : "No se pudo marcar tu salida",
      [keys.onShift]
    );

  return {
    arrive: useMutation(orpc.staffTasks.arrivals.arrive.mutationOptions(change(true))),
    leave: useMutation(orpc.staffTasks.arrivals.leave.mutationOptions(change(false))),
  };
}
