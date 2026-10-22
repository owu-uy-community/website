import type { Page } from "@playwright/test";

import { db } from "../../src/lib/db";
import { staffTaskAssignments, staffTasks } from "../../src/lib/db/schema";
import { wallClock } from "../../src/lib/slot-day";
import { expect, test } from "../fixtures";

/** The page is hydrated and its socket is open: what it shows from here on is live. */
const live = (page: Page) => expect(page.getByText("Tiempo real")).toBeVisible();

/** "YYYY-MM-DD" today on the event's clock. */
const todayOf = (timeZone: string) => wallClock(new Date(), timeZone).slice(0, 10);

test("an editor pastes two rows from the sheet and they land on the schedule", async ({ pageAs, tenant }) => {
  // Dated today, so they're on the day the page opens whatever else this worker's event has.
  const [year, month, day] = todayOf(tenant.event.timezone).split("-");
  const page = await pageAs("editor");
  await page.goto(`/admin/${tenant.community.slug}/tareas?event=${tenant.event.slug}`);
  await live(page);

  await page.getByRole("button", { name: "Importar planilla" }).click();
  const panel = page.getByRole("dialog", { name: "Importar planilla" });
  await panel
    .getByLabel("Filas de la planilla")
    .fill(
      [
        "Tarea\tDía\tInicio\tFin\tLugar\tPersonas",
        `Armar la mesa\t${day}/${month}/${year}\t13:30\t14:00\tEntrada\tCommunity member`,
        `Puerta principal\t${day}/${month}/${year}\t14:00\t15:30\tEntrada\t`,
      ].join("\n")
    );
  await expect(panel.getByText("2 nuevas")).toBeVisible();
  await panel.getByRole("button", { name: "Importar 2 tareas" }).click();
  await expect(panel).toBeHidden();

  await page.getByRole("tab", { name: "Cronograma" }).click();
  await expect(page.getByRole("button", { name: "Armar la mesa", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Puerta principal", exact: true })).toBeVisible();
});

test("a member taps «Llegué» on Mi turno and the staff page counts them on shift", async ({ pageAs, tenant }) => {
  // A task for today on the event's clock, so today is a day of the event.
  const today = todayOf(tenant.event.timezone);
  const [task] = await db
    .insert(staffTasks)
    .values({
      openSpaceId: tenant.event.id,
      title: "Turno de hoy",
      dayDate: new Date(`${today}T00:00:00.000Z`),
      startTime: "00:00",
      endTime: "23:59",
    })
    .returning();
  await db.insert(staffTaskAssignments).values({ taskId: task.id, userId: tenant.users.member.id });
  const [phone, desk] = await Promise.all([pageAs("member"), pageAs("editor")]);
  await desk.goto(`/admin/${tenant.community.slug}/tareas?event=${tenant.event.slug}`);
  await live(desk);
  await expect(desk.getByRole("button", { name: /0 de 1 en turno/ })).toBeVisible();

  await phone.goto(`/admin/${tenant.community.slug}/mi-turno?event=${tenant.event.slug}`);
  await live(phone);
  await phone.getByRole("button", { name: "Llegué" }).click();

  await expect(phone.getByText(/^Llegaste/)).toBeVisible();
  await expect(desk.getByRole("button", { name: /1 de 1 en turno/ })).toBeVisible();
  await phone.reload();
  await expect(phone.getByRole("button", { name: "Salir del turno" })).toBeVisible();
});
