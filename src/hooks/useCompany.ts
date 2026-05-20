/**
 * Single-company + that company's deals hooks.
 *
 * Split into two `useQuery`s rather than one fat one because:
 *   - the company header can render the moment the company query
 *     resolves, even if deals are still loading
 *   - they have different staleness preferences (the deal list is
 *     more likely to grow than the company metadata)
 */

import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type InfiniteData
} from "@tanstack/react-query";
import * as companiesApi from "../api/companies.js";
import { ApiError } from "../api/client.js";
import type { CursorPage, PublicCompany, PublicDeal } from "../api/types.js";

export function useCompany(companyId: string | undefined) {
  return useQuery<PublicCompany, ApiError>({
    queryKey: ["companies", "get", companyId],
    enabled: typeof companyId === "string" && companyId.length > 0,
    queryFn: () => companiesApi.getCompany(companyId!)
  });
}

export interface UseCompanyDealsResult {
  items: PublicDeal[];
  isLoading: boolean;
  isError: boolean;
  /** Typed as ApiError so callers can branch on `error.code` directly. */
  error: ApiError | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

export interface UseCompanyDealsOptions {
  /**
   * Sprint 7.2: per-column sort. Format "field:dir"; default
   * "createdAt:desc". Mirrors the backend default so explicit and
   * implicit calls share one TanStack cache entry.
   */
  sort?: companiesApi.CompanyDealSortSpec;
}

const DEFAULT_COMPANY_DEALS_SORT: companiesApi.CompanyDealSortSpec = "createdAt:desc";

export function useCompanyDeals(
  companyId: string | undefined,
  options: UseCompanyDealsOptions = {}
): UseCompanyDealsResult {
  const sort = options.sort ?? DEFAULT_COMPANY_DEALS_SORT;
  const query = useInfiniteQuery<
    CursorPage<PublicDeal>,
    ApiError,
    InfiniteData<CursorPage<PublicDeal>, string | undefined>,
    unknown[],
    string | undefined
  >({
    queryKey: ["companies", companyId, "deals", { sort }],
    enabled: typeof companyId === "string" && companyId.length > 0,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      companiesApi.listCompanyDeals(companyId!, { sort, cursor: pageParam }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    // Sprint 7.2: keep stale data visible during sort-change refetch
    // to eliminate the table page-jump. Same pattern as the other
    // listing hooks.
    placeholderData: keepPreviousData
  });

  // Memoised — see useCompanies for rationale.
  const items = useMemo(
    () => query.data?.pages.flatMap(page => page.items) ?? [],
    [query.data]
  );

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    isFetchingNextPage: query.isFetchingNextPage
  };
}
