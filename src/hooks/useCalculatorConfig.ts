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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import * as configsApi from "../api/calculator-configs.js";
import type { PublicCalculatorConfig } from "../api/types.js";

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
