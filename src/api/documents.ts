/**
 * Documents endpoint wrappers.
 *
 * Backend reference: server/modules/documents/*. Five endpoints +
 * a numbering peek helper.
 */

import { apiClient } from "./client.js";
import type { CursorPage, PublicDocument } from "./types.js";

export type DocumentScope = "offer" | "agreement" | "offer_and_agreement";

export interface CreateDocumentRequest {
  companyId: string;
  hubspotDealId?: string | null;
  calculatorConfigId?: string | null;
  scope: DocumentScope;
  payload: { schemaVersion: number } & Record<string, unknown>;
  addendum?: string | null;
}

/**
 * Sprint 6.8: per-column sort spec. Allowed `field` values are
 * whitelisted server-side; the frontend types the union here so a
 * typo on the call-site surfaces at compile time.
 */
export type DocumentSortField =
  | "number"
  | "companyName"
  | "scope"
  | "hubspotSyncState"
  | "createdAt";

export interface ListDocumentsParams {
  companyId?: string;
  hubspotDealId?: string;
  /** Sprint 6.4: filter to documents derived from a specific calc-config. */
  calculatorConfigId?: string;
  scope?: DocumentScope;
  q?: string;
  /** Sprint 6.8: "field:asc" or "field:desc"; default "createdAt:desc". */
  sort?: string;
  cursor?: string;
  limit?: number;
}

export async function createDocument(
  body: CreateDocumentRequest
): Promise<PublicDocument> {
  const { data } = await apiClient.post<PublicDocument>("/documents", body);
  return data;
}

export async function getDocumentByNumber(number: string): Promise<PublicDocument> {
  const { data } = await apiClient.get<PublicDocument>(`/documents/${number}`);
  return data;
}

export async function listDocuments(
  params: ListDocumentsParams = {}
): Promise<CursorPage<PublicDocument>> {
  const { data } = await apiClient.get<CursorPage<PublicDocument>>("/documents", {
    params
  });
  return data;
}

/**
 * Returns the new calculator-config id created from the document's
 * payload + the path the frontend should navigate to.
 */
export async function useDocumentAsTemplate(
  number: string
): Promise<{ configId: string; redirectUrl: string }> {
  const { data } = await apiClient.post<{ configId: string; redirectUrl: string }>(
    `/documents/${number}/use-as-template`
  );
  return data;
}

/**
 * GET /api/v1/numbering/peek[?hubspotCompanyId=…] — preview the next
 * BSG-<seq>-<suffix>. Without `hubspotCompanyId` the suffix is
 * rendered as "XXXXXX" so the wizard can show a partial preview
 * before the operator commits to a company.
 *
 * Two near-simultaneous peeks return the same seq; the real
 * allocation happens inside POST /documents and MAY differ if
 * another save lands first.
 */
export async function peekNextNumber(
  params?: { hubspotCompanyId?: string }
): Promise<{ next: string }> {
  const { data } = await apiClient.get<{ next: string }>("/numbering/peek", {
    params: params?.hubspotCompanyId ? params : undefined
  });
  return data;
}
