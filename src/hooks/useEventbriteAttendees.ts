import { useCallback } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { orpc, client } from "lib/orpc";
import type { EventbriteAttendee } from "lib/eventbrite/types";

interface UseEventbriteAttendeesOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  enabled?: boolean;
  infinite?: boolean; // Enable infinite scrolling mode
}

/**
 * Hook for fetching Eventbrite attendees with React Query
 * Supports both regular pagination and infinite scrolling
 */
export const useEventbriteAttendees = ({
  page = 1,
  pageSize = 50,
  status,
  enabled = true,
  infinite = false,
}: UseEventbriteAttendeesOptions = {}) => {
  const queryClient = useQueryClient();

  // Fetch summary data using oRPC (always use regular query for summary)
  const {
    data: summaryData,
    isLoading: summaryLoading,
    isFetching: isSummaryRefreshing,
  } = useQuery(
    orpc.eventbrite.getSummary.queryOptions({
      enabled,
      staleTime: 60 * 1000, // Consider data fresh for 1 minute
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      refetchInterval: 60 * 1000, // Auto-refetch every 1 minute
      retry: 2,
    })
  );

  // Infinite query for attendees (when infinite mode is enabled)
  const infiniteQueryResult = useInfiniteQuery({
    queryKey: [...orpc.eventbrite.getAttendees.key(), { status }],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const result = await client.eventbrite.getAttendees({ page: pageParam, pageSize, status });
      return result;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page_number, page_count } = lastPage.pagination;
      return page_number < page_count ? page_number + 1 : undefined;
    },
    enabled: enabled && infinite,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000, // Auto-refetch every 1 minute
    retry: 2,
  });

  // Regular query for attendees (when infinite mode is disabled)
  const regularQueryResult = useQuery(
    orpc.eventbrite.getAttendees.queryOptions({
      input: { page, pageSize, status },
      enabled: enabled && !infinite,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchInterval: 60 * 1000, // Auto-refetch every 1 minute
      retry: 2,
    })
  );

  // Select the appropriate query result based on mode
  const {
    data: attendeesData,
    isLoading: attendeesLoading,
    error: attendeesError,
    isError: attendeesIsError,
    isFetching: isAttendeesRefreshing,
  } = infinite
    ? {
        data: infiniteQueryResult.data,
        isLoading: infiniteQueryResult.isLoading,
        error: infiniteQueryResult.error,
        isError: infiniteQueryResult.isError,
        isFetching: infiniteQueryResult.isFetching,
      }
    : {
        data: regularQueryResult.data,
        isLoading: regularQueryResult.isLoading,
        error: regularQueryResult.error,
        isError: regularQueryResult.isError,
        isFetching: regularQueryResult.isFetching,
      };

  // Flatten pages for infinite query
  const allAttendees =
    infinite && infiniteQueryResult.data
      ? infiniteQueryResult.data.pages.flatMap((page) => page.attendees)
      : attendeesData && "attendees" in attendeesData
        ? attendeesData.attendees
        : [];

  const pagination =
    infinite && infiniteQueryResult.data
      ? infiniteQueryResult.data.pages[infiniteQueryResult.data.pages.length - 1]?.pagination
      : attendeesData && "pagination" in attendeesData
        ? attendeesData.pagination
        : undefined;

  /**
   * Manually refresh attendees data using oRPC key management
   * Invalidates cache and triggers immediate refetch
   */
  const refreshAttendees = useCallback(async () => {
    // Invalidate to mark as stale
    await queryClient.invalidateQueries({ queryKey: orpc.eventbrite.getAttendees.key() });
    await queryClient.invalidateQueries({ queryKey: orpc.eventbrite.getSummary.key() });
    // Force refetch immediately
    await queryClient.refetchQueries({ queryKey: orpc.eventbrite.getAttendees.key() });
    await queryClient.refetchQueries({ queryKey: orpc.eventbrite.getSummary.key() });
  }, [queryClient]);

  // Helper to get attendees by check-in status
  const getAttendeesByStatus = useCallback(
    (checkedIn: boolean): EventbriteAttendee[] => {
      return allAttendees.filter((a: EventbriteAttendee) => a.checked_in === checkedIn && !a.cancelled && !a.refunded);
    },
    [allAttendees]
  );

  return {
    // Data
    attendees: allAttendees,
    pagination,
    summary: summaryData?.summary,
    event: summaryData?.event,

    // Loading states
    isLoading: attendeesLoading || summaryLoading,
    isRefreshing: isAttendeesRefreshing || isSummaryRefreshing,
    error: attendeesError?.message || null,
    isError: attendeesIsError,

    // Infinite scroll specific
    fetchNextPage: infinite ? infiniteQueryResult.fetchNextPage : undefined,
    hasNextPage: infinite ? infiniteQueryResult.hasNextPage : false,
    isFetchingNextPage: infinite ? infiniteQueryResult.isFetchingNextPage : false,

    // Helper functions
    refreshAttendees,
    getAttendeesByStatus,

    // Computed values
    totalAttendees: pagination?.object_count || 0,
    checkedInCount: summaryData?.summary.checked_in || 0,
    notCheckedInCount: summaryData?.summary.not_checked_in || 0,
  };
};
