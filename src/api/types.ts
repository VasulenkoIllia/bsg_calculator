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
/**
 * Mirrors server/modules/auth/auth.schemas.ts:userPublicSchema 1:1.
 *
 * Drift risk: when the backend `userPublicSchema` grows a field,
 * add it here in the SAME PR. The api client uses generic-cast (not
 * runtime validation) so the type system is our only contract check.
 *
 * Phase 8 Stage 1 (2026-05-21): the legacy `isAdmin: boolean` was
 * replaced with the hierarchical `role` enum. `user` ⊂ `admin` ⊂
 * `super_admin` — higher tiers inherit lower-tier permissions.
 * Components that need an admin gate use the `hasRole(min)` helper
 * exposed by `useAuth()`, not `role === 'admin'` (which would miss
 * super_admin).
 */
export type UserRole = "user" | "admin" | "super_admin";

export interface PublicUser {
  id: string;
  email: string;
  login: string | null;
  displayName: string;
  role: UserRole;
  isActive: boolean;
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
 *
 * `limit` echoes the page size the server used. The UI doesn't read
 * it today but it's part of the wire shape, so keeping it typed makes
 * any future "showing N of …" indicator honest about its source.
 */
export interface CursorPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
  limit: number;
}

// ─── Calculator configs ──────────────────────────────────────────
/**
 * Mirrors server/modules/calculator-configs/calculator-configs.schemas.ts
 * :calculatorConfigPublicSchema.
 *
 * `payload` is the persisted CalculatorSnapshotPayload — defined as
 * `unknown` here because the backend stores it permissively and the
 * UI hydrates via the existing `seedCalculatorStateFromSnapshot()`
 * helper which has its own runtime checks.
 */
export interface PublicCalculatorConfig {
  id: string;
  companyId: string;
  /**
   * Sprint 6.7: surfaced only by the LIST endpoint (JOIN companies).
   * Single-config fetch (GET /calculator-configs/:id) omits it
   * because /calc/:id doesn't need the company name — it renders
   * the config title in the SavedStatusBadge instead.
   *
   * Sprint 6.9 S12: list consumers narrow via
   * `PublicCalculatorConfigListItem` for compile-time guarantee.
   */
  companyName?: string;
  hubspotDealId: string | null;
  title: string | null;
  payload: unknown;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sprint 6.9 S12: narrow shape for items returned by the LIST
 * endpoint of calculator-configs. Mirrors PublicDocumentListItem
 * — companyName is REQUIRED here because the repository's INNER
 * JOIN guarantees it.
 */
export type PublicCalculatorConfigListItem = PublicCalculatorConfig & {
  companyName: string;
};

// ─── Documents ────────────────────────────────────────────────────
/**
 * Mirrors server/modules/documents/documents.schemas.ts
 * :documentPublicSchema.
 *
 * `payload` is typed as `unknown` for the same reason as
 * PublicCalculatorConfig — the backend stores it permissively and
 * the UI hydrates via type-narrowing in the consumer (e.g. wizard
 * template builder).
 */
export interface PublicDocument {
  id: string;
  number: string;
  companyId: string;
  /**
   * Sprint 6.8: surfaced only by the LIST endpoint (JOIN companies).
   * Single-doc fetch (GET /documents/:number) omits it — the detail
   * page already loads the full company elsewhere.
   *
   * Sprint 6.9 S12: still optional here because GET-by-number omits
   * it, but list consumers should narrow via `PublicDocumentListItem`
   * (below) which makes companyName REQUIRED. That captures the
   * runtime invariant (the JOIN is INNER + FK is non-nullable) at
   * the type level for the list-rendering call sites.
   */
  companyName?: string;
  hubspotDealId: string | null;
  calculatorConfigId: string | null;
  scope: "offer" | "agreement" | "offer_and_agreement";
  payload: unknown;
  addendum: string | null;
  hubspotSyncState: "not_synced" | "synced" | "failed";
  hubspotNoteId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sprint 6.9 S12: narrow shape for items returned by the LIST
 * endpoint. `companyName` is REQUIRED here because the repository's
 * INNER JOIN companies + non-nullable FK guarantees it. The list
 * page renders `doc.companyName` directly without a fallback — the
 * type prevents a caller from accidentally piping single-doc
 * results through a list-rendering component.
 */
export type PublicDocumentListItem = PublicDocument & {
  companyName: string;
};

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
