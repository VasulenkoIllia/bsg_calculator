/**
 * Documents hooks — list + single by number.
 *
 * Same shape as useCompanies / useCompany: useInfiniteQuery for the
 * listing (cursor pagination via build-page envelope) and useQuery
 * for a single document by its BSG-XXXXX number.
 */

import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type InfiniteData
} from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { shouldPollSyncBadge } from "../shared/hubspotSyncPoll.js";
import type {
  CursorPage,
  PublicDocument,
  PublicDocumentListItem
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
   *
   * Sprint 6.9 S2: typed via `DocumentSortSpec` so typos in field
   * name or direction fail at compile time.
   */
  sort?: documentsApi.DocumentSortSpec;
  limit?: number;
  /**
   * Sprint 9.N — soft-delete visibility filter for the Status
   * dropdown on /documents. Mirrors the server query enum:
   *   - undefined (default): backend includes deleted rows
   *   - "false": alive only
   *   - "true": alive + deleted
   *   - "only": deleted only
   */
  includeDeleted?: "true" | "false" | "only";
  /**
   * Sprint 6.4: gate the underlying query. Defaults to true (matches
   * pre-6.4 behaviour). Set to false from callers that mount the hook
   * conditionally — e.g. /calc/:id only wants to fetch
   * `?calculatorConfigId=` documents when `isEditMode` is true.
   */
  enabled?: boolean;
}

export interface UseDocumentsResult {
  /**
   * Sprint 6.9 S12: items are narrowed to `PublicDocumentListItem`
   * because the backend list endpoint INNER-JOINs companies and
   * guarantees `companyName`. The narrow type prevents list-renderer
   * call sites from accidentally feeding single-doc payloads
   * (which omit `companyName`) through the same path.
   */
  items: PublicDocumentListItem[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

/** Sprint 6.9 N3: backend default sort. Mirroring it client-side
 * means `useDocuments({})` and `useDocuments({ sort: "createdAt:desc" })`
 * share a single TanStack Query cache entry instead of forking into
 * two identical requests. */
const DEFAULT_DOCUMENTS_SORT: documentsApi.DocumentSortSpec = "createdAt:desc";

export function useDocuments(options: UseDocumentsOptions = {}): UseDocumentsResult {
  const normalisedQ = options.q?.trim() ? options.q.trim() : undefined;
  const sort = options.sort ?? DEFAULT_DOCUMENTS_SORT;

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
        sort,
        // Sprint 9.N — include in cache key so flipping Status filter
        // triggers a fresh fetch.
        includeDeleted: options.includeDeleted,
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
        sort,
        cursor: pageParam,
        limit: options.limit,
        // Sprint 9.N — Status filter passthrough. The api/client
        // layer only sends defined params, so undefined drops out
        // (backend default = include_deleted).
        includeDeleted: options.includeDeleted
      }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    // Sprint 7.0: keep previous data visible while the sort-change
    // refetch is in flight. Without this, flipping sort surfaces as
    // a fresh queryKey → `isLoading=true` → table briefly replaced
    // by the "Loading documents…" row → table shrinks → page jumps.
    // `keepPreviousData` makes the stale rows persist with
    // `isFetching` showing the background refresh state instead.
    placeholderData: keepPreviousData
  });

  // Sprint 6.9 S12: cast through the narrower type since the wire
  // envelope is PublicDocument-shaped but the LIST contract
  // guarantees companyName. This is the single trust boundary —
  // every consumer downstream gets the strict type.
  const items = useMemo(
    () =>
      (query.data?.pages.flatMap(page => page.items) ??
        []) as PublicDocumentListItem[],
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

export interface UseDocumentOptions {
  /**
   * When true, briefly poll a freshly-created, not-yet-synced document
   * so the HubSpot badge catches the create-time auto-sync flip and the
   * operator can't mint a duplicate Note off a stale `not_synced` badge.
   * Policy + rationale live in `shared/hubspotSyncPoll.ts` (shared with
   * `useCalculatorConfig` so the two can't diverge).
   */
  pollWhileSyncing?: boolean;
}

export function useDocument(
  number: string | undefined,
  options: UseDocumentOptions = {}
) {
  return useQuery<PublicDocument, ApiError>({
    queryKey: ["documents", "get", number],
    enabled: typeof number === "string" && number.length > 0,
    queryFn: () => documentsApi.getDocumentByNumber(number!),
    refetchInterval: options.pollWhileSyncing
      ? query => shouldPollSyncBadge(query.state.data)
      : false
  });
}
