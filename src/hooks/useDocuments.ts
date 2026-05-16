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
  scope?: documentsApi.DocumentScope;
  q?: string;
  limit?: number;
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
        scope: options.scope,
        q: normalisedQ,
        limit: options.limit
      }
    ],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      documentsApi.listDocuments({
        companyId: options.companyId,
        hubspotDealId: options.hubspotDealId,
        scope: options.scope,
        q: normalisedQ,
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
