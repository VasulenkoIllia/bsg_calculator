/**
 * TanStack Query hooks for calculator-configs.
 *
 * Same shape as useDocuments / useCompanies: useQuery for the single
 * GET-by-id, useInfiniteQuery for the listing.
 *
 * Sprint 6.1 introduced the single-config hook (`useCalculatorConfig`)
 * to power /calc/:id hydration. Sprint 6.4 added the listing hook
 * (`useCalculatorConfigs`) for the "Saved calculators" tab on
 * CompanyDetailPage + a parallel use inside the
 * "Documents from this calculator" history strip on /calc/:id.
 */

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData
} from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import * as configsApi from "../api/calculator-configs.js";
import type {
  CursorPage,
  PublicCalculatorConfig,
  PublicCalculatorConfigListItem
} from "../api/types.js";

/**
 * GET /api/v1/calculator-configs/:id — single config by UUID.
 *
 * Returns standard TanStack Query result. `enabled` flips off when
 * the caller hasn't resolved an id yet (e.g. `useParams<{ id }>()`
 * before navigation completed). 30s staleTime matches the global
 * default; the auto-save mutation invalidates this key on success so
 * the cached payload stays consistent with the server-of-truth.
 */
export function useCalculatorConfig(id: string | undefined) {
  return useQuery<PublicCalculatorConfig, ApiError>({
    queryKey: ["calculator-configs", "get", id],
    enabled: typeof id === "string" && id.length > 0,
    queryFn: () => configsApi.getCalculatorConfig(id!)
  });
}

/**
 * PUT /api/v1/calculator-configs/:id — auto-save mutation.
 *
 * Caller passes the id + the update body. On success, invalidates
 * the cached single-config + the listing keys so other views
 * (CompanyDetailPage tabs, future picker) reflect the change.
 *
 * Note: this hook does NOT debounce. Debouncing is the caller's
 * responsibility via `useDebouncedValue` on the calculator state
 * — keeping debouncing OUT of the mutation hook makes the hook
 * reusable for other call sites (e.g. an explicit "Save now"
 * button) that want immediate firing.
 */
export function useUpdateCalculatorConfig(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<
    PublicCalculatorConfig,
    ApiError,
    configsApi.UpdateCalculatorConfigRequest
  >({
    mutationKey: ["calculator-configs", "update", id],
    mutationFn: body => {
      if (!id) throw new Error("useUpdateCalculatorConfig: id required");
      return configsApi.updateCalculatorConfig(id, body);
    },
    onSuccess: updated => {
      queryClient.setQueryData(["calculator-configs", "get", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["calculator-configs", "list"] });
    }
  });
}

/**
 * GET /api/v1/calculator-configs?companyId=… — list saved configs.
 *
 * Sprint 6.4: powers the "Saved calculators" tab on CompanyDetailPage.
 * Same useInfiniteQuery shape as useDocuments / useCompanies — cursor
 * pagination via the backend's CursorPage envelope. `showAll=true`
 * drops the per-deal filter so the tab shows EVERY config for the
 * company regardless of which deal (or none) it's pinned to.
 *
 * `enabled` flips off when companyId hasn't been resolved yet (e.g.
 * the route param hasn't loaded) so we never fire a request with
 * undefined in the query string.
 */
export interface UseCalculatorConfigsOptions {
  /**
   * Sprint 6.6: when undefined, the hook still fires — cross-company
   * listing mode for the top-level /calculators page. When the
   * caller doesn't want a fetch at all (e.g. the company-detail
   * page where companyId hasn't loaded yet) it should pass
   * `enabled: false` explicitly.
   */
  companyId?: string;
  hubspotDealId?: string;
  showAll?: boolean;
  /** Sprint 6.6: substring search on title. */
  q?: string;
  /**
   * Sprint 6.8: per-column sort. Format: "field:dir" (e.g.
   * "title:asc"). Default "createdAt:desc". TanStack Query treats
   * sort as part of the cache key, so flipping sort starts a fresh
   * page chain — the backend rejects cursor/sort mismatches with a
   * 400 anyway, so this is defensive.
   *
   * Sprint 6.9 S2: typed via `CalculatorConfigSortSpec` for
   * compile-time typo detection.
   */
  sort?: configsApi.CalculatorConfigSortSpec;
  limit?: number;
  /**
   * Sprint 6.6: gate the underlying TanStack query. Defaults to true.
   * Cross-company mode (companyId omitted) is a legitimate listing
   * shape, so the old "enabled iff companyId present" gating moved
   * onto this explicit flag.
   */
  enabled?: boolean;
}

export interface UseCalculatorConfigsResult {
  /**
   * Sprint 6.9 S12: items narrowed to `PublicCalculatorConfigListItem`.
   * companyName is guaranteed by the backend INNER JOIN; the strict
   * type prevents single-config payloads from leaking through the
   * same render path.
   */
  items: PublicCalculatorConfigListItem[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

/** Sprint 6.9 N3: backend default sort. Single cache entry for the
 * implicit and the explicit-default cases. */
const DEFAULT_CALC_CONFIGS_SORT: configsApi.CalculatorConfigSortSpec =
  "createdAt:desc";

export function useCalculatorConfigs(
  options: UseCalculatorConfigsOptions
): UseCalculatorConfigsResult {
  const sort = options.sort ?? DEFAULT_CALC_CONFIGS_SORT;
  const query = useInfiniteQuery<
    CursorPage<PublicCalculatorConfig>,
    ApiError,
    InfiniteData<CursorPage<PublicCalculatorConfig>, string | undefined>,
    unknown[],
    string | undefined
  >({
    queryKey: [
      "calculator-configs",
      "list",
      {
        companyId: options.companyId,
        hubspotDealId: options.hubspotDealId,
        showAll: options.showAll ?? true,
        q: options.q?.trim() || undefined,
        sort,
        limit: options.limit
      }
    ],
    enabled: options.enabled ?? true,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      configsApi.listCalculatorConfigs({
        companyId: options.companyId,
        hubspotDealId: options.hubspotDealId,
        showAll: options.showAll ?? true,
        q: options.q?.trim() || undefined,
        sort,
        cursor: pageParam,
        limit: options.limit
      }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined
  });

  // Sprint 6.9 S12: cast through the strict list-item type — see
  // useDocuments for the same pattern.
  const items = useMemo(
    () =>
      (query.data?.pages.flatMap(page => page.items) ??
        []) as PublicCalculatorConfigListItem[],
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
