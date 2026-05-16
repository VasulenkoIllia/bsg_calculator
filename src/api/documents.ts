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

export interface ListDocumentsParams {
  companyId?: string;
  hubspotDealId?: string;
  scope?: DocumentScope;
  q?: string;
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
 * GET /api/v1/numbering/peek — preview the next BSG-XXXXX. NOT the
 * eventual number — wizard saves under a TX-allocated number which
 * may differ if another save lands first.
 */
export async function peekNextNumber(): Promise<{ next: string }> {
  const { data } = await apiClient.get<{ next: string }>("/numbering/peek");
  return data;
}
