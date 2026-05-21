/**
 * Calculator-configs endpoint wrappers.
 *
 * Backend reference: server/modules/calculator-configs/*. CRUD plus
 * the picker-scope list (`showAll` flag drops the deal filter).
 */

import { apiClient } from "./client.js";
import type {
  CursorPage,
  PublicCalculatorConfig,
  PublicEventsListResponse
} from "./types.js";

/**
 * POST body shape. `companyId` is the UUID PK on companies; backend
 * rejects cross-company deal pins (deal MUST belong to the company).
 */
export interface CreateCalculatorConfigRequest {
  companyId: string;
  hubspotDealId?: string | null;
  title?: string | null;
  /**
   * The full CalculatorSnapshotPayload (frontend type). Stored verbatim
   * in the JSONB column. Backend validates `payload.schemaVersion`
   * exists (matches the frontend's extractCalculatorSnapshot output)
   * but otherwise passes the shape through unchanged.
   */
  payload: { schemaVersion: number } & Record<string, unknown>;
}

/** PUT body — same as create minus `companyId` (locked after insert). */
export type UpdateCalculatorConfigRequest = Omit<CreateCalculatorConfigRequest, "companyId">;

/**
 * Sprint 6.8: per-column sort spec union. Same shape as
 * documents.DocumentSortField — kept in lockstep with the backend
 * whitelist (server/modules/calculator-configs/calculator-configs.repository.ts
 * → calculatorConfigSortFields).
 */
export type CalculatorConfigSortField =
  | "title"
  | "companyName"
  | "hubspotDealId"
  | "updatedAt"
  | "createdAt";

/**
 * Sprint 6.9 S2: typed sort string. Catches typos at compile time.
 */
export type CalculatorConfigSortSpec =
  `${CalculatorConfigSortField}:${"asc" | "desc"}`;

export interface ListCalculatorConfigsParams {
  /**
   * Sprint 6.6: optional. When omitted → cross-company listing for
   * the top-level `/calculators` discovery page. When present →
   * filters by this company (Sprint 3 wizard picker + Sprint 6.4
   * CompanyDetailPage tab).
   */
  companyId?: string;
  hubspotDealId?: string;
  /** Default false → filter to (company-level OR deal-pinned). */
  showAll?: boolean;
  /** Sprint 6.6: substring search on title. Empty string ignored. */
  q?: string;
  /** Sprint 6.8 / S2: typed "field:asc" or "field:desc"; default "createdAt:desc". */
  sort?: CalculatorConfigSortSpec;
  cursor?: string;
  limit?: number;
}

export async function createCalculatorConfig(
  body: CreateCalculatorConfigRequest
): Promise<PublicCalculatorConfig> {
  const { data } = await apiClient.post<PublicCalculatorConfig>(
    "/calculator-configs",
    body
  );
  return data;
}

export async function getCalculatorConfig(id: string): Promise<PublicCalculatorConfig> {
  const { data } = await apiClient.get<PublicCalculatorConfig>(
    `/calculator-configs/${id}`
  );
  return data;
}

export async function updateCalculatorConfig(
  id: string,
  body: UpdateCalculatorConfigRequest
): Promise<PublicCalculatorConfig> {
  const { data } = await apiClient.put<PublicCalculatorConfig>(
    `/calculator-configs/${id}`,
    body
  );
  return data;
}

export async function deleteCalculatorConfig(id: string): Promise<void> {
  await apiClient.delete(`/calculator-configs/${id}`);
}

/**
 * Phase 9.I — POST /calculator-configs/:id/sync.
 *
 * Manual HubSpot Note write-back for a saved calc-config. Each call
 * creates a fresh Note (audit trail in HubSpot). Auto-saves on
 * /calc/:id (PUT) do NOT trigger sync — only this endpoint does.
 */
export async function syncCalculatorConfigToHubspot(
  id: string
): Promise<PublicCalculatorConfig> {
  const { data } = await apiClient.post<PublicCalculatorConfig>(
    `/calculator-configs/${id}/sync`
  );
  return data;
}

export async function listCalculatorConfigs(
  params: ListCalculatorConfigsParams
): Promise<CursorPage<PublicCalculatorConfig>> {
  const { data } = await apiClient.get<CursorPage<PublicCalculatorConfig>>(
    "/calculator-configs",
    { params }
  );
  return data;
}

/**
 * Phase 8 Stage 4 — GET /calculator-configs/:id/events.
 * Returns the per-calc audit trail in DESC order (newest first).
 * Any authenticated user can read; the History panel on /calc/:id
 * (edit mode) consumes this.
 */
export async function listCalculatorConfigEvents(
  id: string
): Promise<PublicEventsListResponse> {
  const { data } = await apiClient.get<PublicEventsListResponse>(
    `/calculator-configs/${encodeURIComponent(id)}/events`
  );
  return data;
}
