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

import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  type InfiniteData
} from "@tanstack/react-query";
import * as companiesApi from "../api/companies.js";
import { ApiError } from "../api/client.js";
import type { CursorPage, PublicCompany } from "../api/types.js";

/**
 * Minimum length for a search query to actually hit the backend. The
 * server's Zod schema enforces `q.min(2)` so anything shorter would
 * return 422; we normalise to `undefined` (no filter) instead.
 * Exported so the test suite + any future direct caller stays in sync.
 */
export const COMPANIES_SEARCH_MIN_LENGTH = 2;

export interface UseCompaniesOptions {
  /** Trimmed substring search; pass undefined / "" for no filter. */
  q?: string;
  /**
   * Sprint 7.2: per-column sort. Format: "field:dir" (e.g.
   * "name:asc"). Default "createdAt:desc". TanStack Query treats
   * sort as part of the cache key, so flipping sort starts a fresh
   * page chain.
   */
  sort?: companiesApi.CompanySortSpec;
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
 * Normalise a raw search input to the value the backend should see.
 * Inputs below the min length are treated as "no filter" — the same
 * threshold used for both the query key AND the fetched query, so
 * one-keystroke typing doesn't pollute the cache with phantom entries
 * that always return the unfiltered list.
 */
function normaliseSearch(q: string | undefined): string | undefined {
  const trimmed = q?.trim();
  return trimmed && trimmed.length >= COMPANIES_SEARCH_MIN_LENGTH ? trimmed : undefined;
}

/** Sprint 7.2: backend default — mirror it so explicit-default and
 * implicit-default callers share a single TanStack cache entry. */
const DEFAULT_COMPANIES_SORT: companiesApi.CompanySortSpec = "createdAt:desc";

function buildKey(
  q: string | undefined,
  sort: companiesApi.CompanySortSpec,
  limit: number | undefined
): unknown[] {
  return ["companies", "list", { q: normaliseSearch(q), sort, limit }];
}

export function useCompanies({ q, sort, limit }: UseCompaniesOptions = {}): UseCompaniesResult {
  const normalisedQ = normaliseSearch(q);
  const effectiveSort = sort ?? DEFAULT_COMPANIES_SORT;

  const query = useInfiniteQuery<
    CursorPage<PublicCompany>,
    ApiError,
    InfiniteData<CursorPage<PublicCompany>, string | undefined>,
    unknown[],
    string | undefined
  >({
    queryKey: buildKey(normalisedQ, effectiveSort, limit),
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      companiesApi.listCompanies({
        q: normalisedQ,
        sort: effectiveSort,
        cursor: pageParam,
        limit
      }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    // Sprint 7.2: same anti-jump pattern as documents + calc-configs.
    placeholderData: keepPreviousData
  });

  // Memoised so consumers don't get a new array reference (and thus
  // a re-render storm in any `useEffect([items])` they have) on every
  // ancestor re-render. `query.data` is stable across renders while
  // nothing changes, so this recomputes only on a successful fetch.
  const items = useMemo(
    () => query.data?.pages.flatMap(page => page.items) ?? [],
    [query.data]
  );

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
