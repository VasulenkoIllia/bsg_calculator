/**
 * Barrel for the api/ layer.
 *
 * Convention: components and hooks import from `~/api` (or
 * `../../api` depending on the file) — never reach inside specific
 * files. This gives us one chokepoint for renaming endpoints.
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
