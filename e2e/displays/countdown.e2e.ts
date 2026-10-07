import { expect, test } from "../fixtures";

test("the countdown screen follows the admin live and ticks on its own", async ({ page, pageAs, board }) => {
  const screen = await pageAs("anonymous");
  await screen.goto(`/comunidad/${board.community.slug}/events/${board.event.slug}/countdown`);
  await expect(screen.getByText("00:00")).toBeVisible();
  const act = (json: Record<string, unknown>) =>
    page.request.post("/api/orpc/countdown/updateState", { data: { json: { eventId: board.event.id, ...json } } });

  await act({ action: "setDuration", durationSeconds: 300 });
  await expect(screen.getByText("05:00")).toBeVisible();

  await act({ action: "start" });
  await expect(screen.getByText(/^04:5\d$/)).toBeVisible();
});
