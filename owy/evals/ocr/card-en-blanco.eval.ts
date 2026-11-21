import { readFile } from "node:fs/promises";
import { defineEval } from "eve/evals";

/**
 * The card is blank, so there is nothing to read. This guards the failure mode the handwriting
 * literature keeps finding — a model inventing a plausible name rather than admitting it cannot
 * read one — on the path staff actually use on event day: a photo sent to Owy.
 *
 * Needs the site API reachable (`digitize_board_photo` calls the site's OCR), hence `live`.
 */
// From the app root (eve runs evals there, like its own fixture loaders): eve compiles this
// module into node_modules/.cache, so a path relative to import.meta.url points nowhere.
const card = await readFile("evals/fixtures/card-en-blanco.png");

export default defineEval({
  description: "Una card en blanco se digitaliza sin inventar datos ni tocar la grilla.",
  tags: ["live"],
  async test(t) {
    await t.send([
      { type: "text", text: "Che, cargá esta card del open space" },
      { type: "file", mediaType: "image/png", data: card.toString("base64") },
    ]);

    t.succeeded();
    t.calledTool("digitize_board_photo");
    t.notCalledTool("create_track");
    t.judge(
      "La tarjeta está vacía. La respuesta NO afirma un nombre de orador ni un título de charla concretos: avisa que no pudo leerlos, o se los pide al staff. Sugerir una sala u horario está bien; inventar datos de la tarjeta, no."
    ).atLeast(0.7);
  },
});
