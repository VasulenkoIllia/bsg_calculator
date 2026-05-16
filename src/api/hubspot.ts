/**
 * HubSpot support endpoints.
 *
 * Currently a single GET /hubspot/pipelines. Sprint 5 will add a
 * POST /hubspot/refresh trigger and a POST /hubspot/webhooks receiver
 * (the webhooks endpoint is HMAC-signed, not Bearer-auth — see
 * decisions.md "Sprint 5 webhooks").
 *
 * The pipelines call is rate-limited tighter than the general API
 * (10/min/IP) because every cache miss costs one upstream HubSpot
 * request — calling it from a render loop would burn the per-app
 * quota fast.
 */

import { apiClient } from "./client.js";
import type { HubspotPipeline } from "./types.js";

export async function getPipelines(): Promise<HubspotPipeline[]> {
  const { data } = await apiClient.get<HubspotPipeline[]>("/hubspot/pipelines");
  return data;
}
