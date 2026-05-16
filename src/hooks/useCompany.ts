/**
 * Single-company + that company's deals hooks.
 *
 * Split into two `useQuery`s rather than one fat one because:
 *   - the company header can render the moment the company query
 *     resolves, even if deals are still loading
 *   - they have different staleness preferences (the deal list is
 *     more likely to grow than the company metadata)
 */

import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
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

export function useCompanyDeals(companyId: string | undefined): UseCompanyDealsResult {
  const query = useInfiniteQuery<
    CursorPage<PublicDeal>,
    ApiError,
    InfiniteData<CursorPage<PublicDeal>, string | undefined>,
    unknown[],
    string | undefined
  >({
    queryKey: ["companies", companyId, "deals"],
    enabled: typeof companyId === "string" && companyId.length > 0,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      companiesApi.listCompanyDeals(companyId!, { cursor: pageParam }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined
  });

  const items =
    query.data?.pages.flatMap((page: CursorPage<PublicDeal>) => page.items) ?? [];

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
