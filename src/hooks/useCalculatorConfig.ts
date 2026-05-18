/**
 * TanStack Query hooks for calculator-configs.
 *
 * Same shape as useDocuments / useCompanies: useQuery for the single
 * GET-by-id, useInfiniteQuery for the listing.
 *
 * Sprint 6.1 introduced the single-config hook to power /calc/:id
 * hydration. Sprint 6.4 will add the listing hook for the
 * "Saved calculators" tab on CompanyDetailPage.
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
import type { CursorPage, PublicCalculatorConfig } from "../api/types.js";

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
  companyId: string | undefined;
  hubspotDealId?: string;
  showAll?: boolean;
  limit?: number;
}

export interface UseCalculatorConfigsResult {
  items: PublicCalculatorConfig[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: ApiError | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

export function useCalculatorConfigs(
  options: UseCalculatorConfigsOptions
): UseCalculatorConfigsResult {
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
        limit: options.limit
      }
    ],
    enabled: typeof options.companyId === "string" && options.companyId.length > 0,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      configsApi.listCalculatorConfigs({
        // The `enabled` gate above ensures companyId is non-empty by
        // the time queryFn runs; the non-null assertion is safe here.
        companyId: options.companyId!,
        hubspotDealId: options.hubspotDealId,
        showAll: options.showAll ?? true,
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
