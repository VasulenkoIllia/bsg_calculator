/**
 * Cursor-paginated companies hook backed by React Query.
 *
 * Uses `useInfiniteQuery` so:
 *   - the cached pages survive remounts
 *   - "Load more" replays the next cursor without re-fetching pages
 *     the user has already seen
 *   - changing the search `q` produces a brand-new query key (=
 *     fresh pagination chain) instead of trying to splice into the
 *     old result set
 *
 * Returns a flattened `items: PublicCompany[]` so consumers don't
 * have to reduce over `data.pages` themselves.
 */

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import * as companiesApi from "../api/companies.js";
import { ApiError } from "../api/client.js";
import type { CursorPage, PublicCompany } from "../api/types.js";

export interface UseCompaniesOptions {
  /** Trimmed substring search; pass undefined / "" for no filter. */
  q?: string;
  /** Page size; defaults to backend default (25), capped server-side at 50. */
  limit?: number;
}

export interface UseCompaniesResult {
  items: PublicCompany[];
  isLoading: boolean;
  /** True while a background refetch is in flight (vs initial isLoading). */
  isFetching: boolean;
  isError: boolean;
  /** Typed as ApiError so callers can branch on `error.code` directly. */
  error: ApiError | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

/**
 * Build a stable query key. Empty / whitespace-only `q` is normalised
 * to undefined so toggling the input between "" and "  " doesn't
 * thrash the query cache.
 */
function buildKey(q: string | undefined, limit: number | undefined): unknown[] {
  const normalisedQ = q?.trim() && q.trim().length > 0 ? q.trim() : undefined;
  return ["companies", "list", { q: normalisedQ, limit }];
}

export function useCompanies({ q, limit }: UseCompaniesOptions = {}): UseCompaniesResult {
  const normalisedQ = q?.trim() && q.trim().length >= 2 ? q.trim() : undefined;

  const query = useInfiniteQuery<
    CursorPage<PublicCompany>,
    ApiError,
    InfiniteData<CursorPage<PublicCompany>, string | undefined>,
    unknown[],
    string | undefined
  >({
    queryKey: buildKey(normalisedQ, limit),
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      companiesApi.listCompanies({
        q: normalisedQ,
        cursor: pageParam,
        limit
      }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined
  });

  const items =
    query.data?.pages.flatMap((page: CursorPage<PublicCompany>) => page.items) ?? [];

  return {
    items,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    isFetchingNextPage: query.isFetchingNextPage
  };
}
