import { defineEval } from "eve/evals";

export default defineEval({
  description: "Mantiene el tono rioplatense amable en una consulta casual.",
  async test(t) {
    await t.send("che, qué es eso del open space? nunca fui a uno");
    t.succeeded();
    t.judge.autoevals
      .closedQA(
        "La respuesta está en español rioplatense (voseo: 'podés', 'tenés', o similar), es amigable y cercana, explica qué es un open space, y no es un muro de texto interminable."
      )
      .atLeast(0.7);
  },
});
