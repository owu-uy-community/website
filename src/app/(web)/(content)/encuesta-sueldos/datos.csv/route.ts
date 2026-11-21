import { ORPCError } from "@orpc/server";

import { callerFor } from "lib/orpc/server";

/** The open dataset of a published edition: /encuesta-sueldos/datos.csv?edicion=2027 (defaults to the current one) */
export async function GET(request: Request) {
  const caller = callerFor(request.headers);
  const slug = new URL(request.url).searchParams.get("edicion") ?? (await caller.salarySurvey.current()).survey?.slug;
  if (!slug) return new Response("Todavía no hay datos publicados\n", { status: 404 });

  try {
    const { filename, csv } = await caller.salarySurvey.dataset({ slug });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof ORPCError && (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")) {
      return new Response("Esa edición no tiene datos publicados\n", { status: 404 });
    }
    throw error;
  }
}
