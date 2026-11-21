import { generateText } from "ai";
import { Effect } from "effect";

import { getToday } from "../dashboard/today";
import { UpstreamFailed } from "../errors";
import { AI_TIMEOUT_MS, describeAiFailure, gatewayFallbacks } from "../ocr/models";
import { Ai } from "../services";

/** A quick, cheap answer over a page of JSON; the same family the card reader already relies on. */
export const ASK_MODEL = {
  primary: "google/gemini-3.8-flash",
  fallbacks: ["google/gemini-3.5-flash-lite", "openai/gpt-5.6-terra"],
} as const;

const INSTRUCTIONS = `Sos Owy, el carpincho que ayuda al equipo de OWU a organizar su conferencia.
Te preguntan desde el panel de administración. Respondé en español rioplatense con voseo, en una o dos
oraciones, con cifras concretas. Usá solamente los datos del evento que te pasan (son de este momento);
si la respuesta no está ahí, decí que no lo sabés y a qué página del admin mirar (Hoy, Agenda, Guion del
día, Staff y tareas, Asistentes, Comunicación, Incidentes, Pantallas). Nunca inventes nombres ni horarios.`;

/** Answer an organizer's question from the same data mission control shows. */
export const ask = (eventId: string, question: string) =>
  Effect.gen(function* () {
    const today = yield* getToday(eventId);
    const ai = yield* Ai;
    // The report and the chart series are noise for a question asked on the day.
    const { report: _report, registrations, ...state } = today;
    const context = JSON.stringify({
      ...state,
      registrations: registrations ? { ...registrations, series: undefined } : null,
    });

    const result = yield* Effect.tryPromise({
      try: (signal) =>
        generateText({
          model: ai.model(ASK_MODEL.primary),
          providerOptions: gatewayFallbacks(ASK_MODEL),
          temperature: 0.2,
          reasoning: "low",
          timeout: { totalMs: AI_TIMEOUT_MS },
          abortSignal: signal,
          instructions: INSTRUCTIONS,
          prompt: `Datos del evento (JSON, ${today.generatedAt}):\n${context}\n\nPregunta: ${question}`,
        }),
      catch: (cause) => new UpstreamFailed({ service: "AI Gateway", message: describeAiFailure(cause), cause }),
    });

    return { answer: result.text.trim() };
  });
