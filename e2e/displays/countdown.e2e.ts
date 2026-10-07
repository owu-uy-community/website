import { expect, test } from "../fixtures";

test("the countdown screen follows the admin live and ticks on its own", async ({ page, pageAs, board }) => {
  const screen = await pageAs("anonymous");
  const socket = screen.waitForEvent("websocket");
  await screen.goto(`/comunidad/${board.community.slug}/events/${board.event.slug}/countdown`);
  // Changes only reach a screen that is listening: wait until the hub confirms the subscription.
  await (
    await socket
  ).waitForEvent("framereceived", {
    predicate: (frame) => String(frame.payload).includes(`"ch":"event:${board.event.id}:countdown"`),
  });
  const act = (json: Record<string, unknown>) =>
    page.request.post("/api/orpc/countdown/updateState", { data: { json: { eventId: board.event.id, ...json } } });

  await act({ action: "setDuration", durationSeconds: 300 });
  await expect(screen.getByText("05:00")).toBeVisible();

  await act({ action: "start" });
  await expect(screen.getByText(/^04:5\d$/)).toBeVisible();
});
