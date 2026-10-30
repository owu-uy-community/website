import { openApiHandler, requestContext } from "lib/orpc/handlers";

/** Every procedure as plain HTTP + JSON; staff see the docs at /api/v1/docs. */
async function handle(request: Request) {
  const { matched, response } = await openApiHandler.handle(request, {
    prefix: "/api/v1",
    context: () => requestContext(request.headers),
  });

  return matched ? response : new Response("Not found", { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
