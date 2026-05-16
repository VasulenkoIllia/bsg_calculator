/**
 * Frontend ↔ backend wire types.
 *
 * These mirror the public response shapes from `server/modules/{auth,
 * companies, deals, hubspot}/*.schemas.ts`. Kept narrow on purpose —
 * the backend `hubspotRaw` JSON column is intentionally NOT surfaced
 * here because the UI never reads it.
 *
 * When backend schemas change, update this file in lockstep. A Zod
 * "shared schemas" refactor is in the backlog (see decisions.md
 * "Phase 8 backend conventions") — until then, we duplicate the
 * minimum surface the UI needs.
 */

// ─── Error envelope (backend `shared/errors.ts`) ──────────────────
/**
 * Wire shape returned by the backend error-handler middleware for
 * every 4xx/5xx response. `code` is the stable machine-readable key;
 * UIs that branch on errors should match `code`, not `message`.
 */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Auth ─────────────────────────────────────────────────────────
export interface PublicUser {
  id: string;
  login: string;
  displayName: string;
  role: "admin" | "operator";
  active: boolean;
  createdAt: string; // ISO
}

export interface LoginRequest {
  identifier: string; // login OR email
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken: string;
}

// ─── Companies ────────────────────────────────────────────────────
export interface PublicCompany {
  id: string; // UUID
  hubspotCompanyId: string;
  name: string;
  companyType: string | null;
  segmentType: string | null;
  lifecycleStage: string | null;
  hsTaskLabel: string | null;
  hubspotCreatedAt: string;
  hubspotModifiedAt: string;
  lastSyncedAt: string;
}

// ─── Deals ────────────────────────────────────────────────────────
export interface PublicDeal {
  id: string;
  hubspotDealId: string;
  hubspotCompanyId: string;
  name: string;
  stage: string | null;
  pipelineId: string | null;
  amount: string | null; // pg numeric() is a string
  currency: string | null;
  clientLabel: string | null;
  agentLabel: string | null;
  businessVertical: string | null;
  hubspotCreatedAt: string;
  hubspotModifiedAt: string;
  lastSyncedAt: string;
}

// ─── Cursor pagination ────────────────────────────────────────────
/**
 * Backend `shared/build-page.ts` envelope. The cursor is an opaque
 * base64 string — UI MUST pass it back verbatim on the next request.
 */
export interface CursorPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

// ─── HubSpot ──────────────────────────────────────────────────────
export interface HubspotPipeline {
  id: string;
  label: string;
  stages: HubspotPipelineStage[];
}

export interface HubspotPipelineStage {
  id: string;
  label: string;
  displayOrder: number;
  metadata: {
    isClosed: boolean;
    probability: string;
  };
}
