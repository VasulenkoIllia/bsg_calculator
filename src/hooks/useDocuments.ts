/**
 * Documents hooks — list + single by number.
 *
 * Same shape as useCompanies / useCompany: useInfiniteQuery for the
 * listing (cursor pagination via build-page envelope) and useQuery
 * for a single document by its BSG-XXXXX number.
 */

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData
} from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import type {
  CursorPage,
  PublicDocument
} from "../api/types.js";

export interface UseDocumentsOptions {
  companyId?: string;
  hubspotDealId?: string;
  /** Sprint 6.4: filter to documents derived from a specific calc-config. */
  calculatorConfigId?: string;
  scope?: documentsApi.DocumentScope;
  q?: string;
  /**
   * Sprint 6.8: per-column sort. Format: "field:dir" (e.g.
   * "companyName:asc"). Default "createdAt:desc" (matches pre-6.8
   * behaviour). Changing sort mid-pagination resets the cursor chain
   * automatically because TanStack Query treats it as a new queryKey.
   */
  sort?: string;
  limit?: number;
  /**
   * Sprint 6.4: gate the underlying query. Defaults to true (matches
   * pre-6.4 behaviour). Set to false from callers that mount the hook
   * conditionally — e.g. /calc/:id only wants to fetch
   * `?calculatorConfigId=` documents when `isEditMode` is true.
   */
  enabled?: boolean;
}

export interface UseDocumentsResult {
  items: PublicDocument[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

export function useDocuments(options: UseDocumentsOptions = {}): UseDocumentsResult {
  const normalisedQ = options.q?.trim() ? options.q.trim() : undefined;

  const query = useInfiniteQuery<
    CursorPage<PublicDocument>,
    ApiError,
    InfiniteData<CursorPage<PublicDocument>, string | undefined>,
    unknown[],
    string | undefined
  >({
    queryKey: [
      "documents",
      "list",
      {
        companyId: options.companyId,
        hubspotDealId: options.hubspotDealId,
        calculatorConfigId: options.calculatorConfigId,
        scope: options.scope,
        q: normalisedQ,
        // Sprint 6.8: sort is part of the cache key so flipping sort
        // surfaces as a new query rather than reusing the cursor
        // chain — the backend would 400 on a sort/cursor mismatch.
        sort: options.sort,
        limit: options.limit
      }
    ],
    enabled: options.enabled ?? true,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      documentsApi.listDocuments({
        companyId: options.companyId,
        hubspotDealId: options.hubspotDealId,
        calculatorConfigId: options.calculatorConfigId,
        scope: options.scope,
        q: normalisedQ,
        sort: options.sort,
        cursor: pageParam,
        limit: options.limit
      }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined
  });

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

export function useDocument(number: string | undefined) {
  return useQuery<PublicDocument, ApiError>({
    queryKey: ["documents", "get", number],
    enabled: typeof number === "string" && number.length > 0,
    queryFn: () => documentsApi.getDocumentByNumber(number!)
  });
}
