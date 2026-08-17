import { defineEval } from "eve/evals";

export default defineEval({
  description: "Responde fecha y lugar de la conf desde knowledge, sin inventar.",
  tags: ["smoke"],
  async test(t) {
    await t.send("Hola Owy! ¿Cuándo y dónde es la OWU Conf?");
    t.succeeded();
    t.messageIncludes(/7 de noviembre|07 de noviembre|7\/11/i);
    t.messageIncludes(/Sinergia/i);
  },
});
