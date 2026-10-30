// Local-only visual test host for the SAME admin workbench component. No admin
// shell, auth bypass, server API, credentials, or production fixture effects.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import CompanionWorkbench from "../../../src/components/Companion/CompanionWorkbench";
// The audio-routing card queries the site's oRPC API; here it just reports "bridge offline".
const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queries}>
    <CompanionWorkbench />
  </QueryClientProvider>
);
