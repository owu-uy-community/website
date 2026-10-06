"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

import { reportError } from "lib/errors/client";
import { isExpectedError } from "lib/sentry/options";

const keyOf = (key: readonly unknown[]) => key.map(String).join(".");

export function makeQueryClient() {
  return new QueryClient({
    // Every failed query and mutation is reported once, here; call sites only decide what to show.
    queryCache: new QueryCache({
      onError: (error, query) => reportError(error, { action: "query", procedure: keyOf(query.queryKey) }),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        reportError(error, { action: "mutation", procedure: keyOf(mutation.options.mutationKey ?? []) }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes
        // An expected refusal (404, 403, a validation error) will not change on retry.
        retry: (failureCount, error) => !isExpectedError(error) && failureCount < 2,
      },
      mutations: {
        retry: false, // Don't retry mutations by default
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
