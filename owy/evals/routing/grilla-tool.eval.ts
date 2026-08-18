import { defineEval } from "eve/evals";

export default defineEval({
  description: "Una pregunta por la grilla llama a get_openspace_board (necesita la API del sitio corriendo).",
  tags: ["live"],
  async test(t) {
    await t.send("Mostrame cómo está la grilla del open space ahora");
    t.succeeded();
    t.calledTool("get_openspace_board");
    t.notCalledTool("create_track");
    t.notCalledTool("delete_track");
  },
});
