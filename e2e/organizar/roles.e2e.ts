import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { communityRoles } from "../../src/lib/db/schema";
import { makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, makeOrganizer } from "./kit";

test("a meetup community's roles leave the conference's out, and keep what a role already held", async ({
  pageFor,
}) => {
  const { community, organizer, panel } = await makeOrganizer("admin");
  // A custom role made back when it listed everything: it holds a conference-only permission
  await db.insert(communityRoles).values({
    communityId: community.id,
    role: "difusion",
    label: "Difusión",
    permission: { event: ["list", "read"], task: ["read"] },
  });
  const page = await pageFor(organizer);
  await page.goto(`${panel}/equipo`);

  const roles = page.locator("#roles");
  await expect(roles.getByRole("button", { name: /^Miembro/ })).toContainText(
    "Ayuda en la puerta y ve los pedidos de espacio."
  );
  await expect(roles).not.toContainText("Staff del día");
  await expect(roles.getByRole("button", { name: /^Difusión/ })).not.toContainText("Tareas");
  await expectAccessible(page, { include: "main" });

  await roles.getByRole("button", { name: /^Difusión/ }).click();
  const editor = page.getByRole("dialog", { name: "Editar «Difusión»" });
  for (const hidden of ["Salas", "Tareas", "Avisos al staff", "Asistente"]) {
    await expect(editor.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  await expect(editor.getByRole("checkbox", { name: "Ver reportes de conducta" })).toBeVisible();
  await expect(editor.getByRole("checkbox", { name: "Atender" })).toHaveCount(0);
  await editor.getByRole("textbox", { name: "Nombre" }).fill("Difusión y redes");
  await editor.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Rol guardado")).toBeVisible();

  const [saved] = await db
    .select({ label: communityRoles.label, permission: communityRoles.permission })
    .from(communityRoles)
    .where(and(eq(communityRoles.communityId, community.id), eq(communityRoles.role, "difusion")));
  expect(saved.label).toBe("Difusión y redes");
  expect(saved.permission.task).toStrictEqual(["read"]);
});

test("a community that runs an open space sees every permission", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("admin");
  await makeEvent(community.id, { name: "Su open space", format: "open-space" });
  const page = await pageFor(organizer);
  await page.goto(`${panel}/equipo`);

  await page.locator("#roles").getByRole("button", { name: "Nuevo rol" }).click();
  const editor = page.getByRole("dialog", { name: "Nuevo rol" });
  await expect(editor.getByText("Salas", { exact: true })).toBeVisible();
  await expect(editor.getByText("Tareas", { exact: true })).toBeVisible();
});
