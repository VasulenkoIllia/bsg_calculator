/**
 * Barrel for the api/ layer.
 *
 * Convention (2.8.F.5): hooks should prefer DIRECT imports from
 * `../api/companies.js` (better tree-shaking, simpler grep). The
 * namespace re-exports below remain so call sites that prefer
 * `api.companies.listCompanies(...)` still work — pick one style and
 * stay consistent within a feature. The error envelope + `ApiError`
 * class always come from this barrel.
 */

export {
  ApiError,
  apiClient,
  getAccessToken,
  setAccessToken,
  setSessionLostHandler
} from "./client.js";

export type {
  ApiErrorEnvelope,
  CursorPage,
  HubspotPipeline,
  HubspotPipelineStage,
  LoginRequest,
  LoginResponse,
  PublicCompany,
  PublicDeal,
  PublicUser,
  RefreshResponse
} from "./types.js";

export * as auth from "./auth.js";
export * as companies from "./companies.js";
export * as deals from "./deals.js";
export * as hubspot from "./hubspot.js";
