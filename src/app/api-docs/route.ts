import { ApiReference } from "@scalar/nextjs-api-reference";

const config = {
  url: "/api/orpc/spec.json",
  theme: "default" as const,
  darkMode: true,
};

export const GET = ApiReference(config);
