import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { router } from "../../../../lib/orpc/router";

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

export async function GET() {
  const spec = await openAPIGenerator.generate(router, {
    info: {
      title: "OWU API",
      version: "1.0.0",
      description: "Open Space, Event Management, and OCR API",
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        description: "Current environment",
      },
    ],
    tags: [
      {
        name: "Open Spaces",
        description: "Operations for managing open space events",
      },
      {
        name: "Schedules",
        description: "Operations for managing event schedules",
      },
      {
        name: "Rooms",
        description: "Operations for managing event rooms/venues",
      },
      {
        name: "Tracks",
        description: "Operations for managing tracks (sticky notes/sessions)",
      },
      {
        name: "Eventbrite",
        description: "Integration with Eventbrite for attendee management",
      },
      {
        name: "OCR",
        description: "Optical Character Recognition for processing images",
      },
    ],
  });

  // Add tags to operations based on their path
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      let tag: string | undefined;
      if (path.includes("/openSpaces")) tag = "Open Spaces";
      else if (path.includes("/schedules")) tag = "Schedules";
      else if (path.includes("/rooms")) tag = "Rooms";
      else if (path.includes("/tracks")) tag = "Tracks";
      else if (path.includes("/eventbrite")) tag = "Eventbrite";
      else if (path.includes("/ocr")) tag = "OCR";

      if (tag) {
        // Apply tag to all operations in this path
        for (const method of ["get", "post", "put", "patch", "delete"] as const) {
          const operation = pathItem[method];
          if (operation) {
            operation.tags = [tag];
          }
        }
      }
    }
  }

  return Response.json(spec);
}
