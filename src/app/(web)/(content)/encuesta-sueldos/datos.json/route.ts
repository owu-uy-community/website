import { ORPCError } from "@orpc/server";

import { callerFor } from "lib/orpc/server";

/** The open dataset as JSON rows: /encuesta-sueldos/datos.json?edicion=2027 (defaults to the current edition) */
export async function GET(request: Request) {
  const caller = callerFor(request.headers);
  const slug = new URL(request.url).searchParams.get("edicion") ?? (await caller.salarySurvey.current()).survey?.slug;
  if (!slug) return Response.json({ error: "Todavía no hay datos publicados" }, { status: 404 });

  try {
    const dataset = await caller.salarySurvey.datasetRows({ slug });

    return Response.json(dataset, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    if (error instanceof ORPCError && (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")) {
      return Response.json({ error: "Esa edición no tiene datos publicados" }, { status: 404 });
    }
    throw error;
  }
}
