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
  // ISO timestamp when HubSpot deleted/merged-away this company while it
  // still owned documents (so the row was retained). NULL = live in
  // HubSpot. Drives the "Deleted in HubSpot" badge.
  hubspotDeletedAt: string | null;
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
  /**
   * Phase 9.I — HubSpot Note write-back state. Same enum as on
   * `PublicDocument`. `not_synced` is the default before any
   * sync attempt; `synced` after a successful POST/PUT chain;
   * `failed` after a HubSpot error (operator can Retry from the
   * UI).
   */
  hubspotNoteId: string | null;
  // Cycle 2 — widened with the delete-flow transition states (parity
  // with PublicDocument). The list badge renders 'delete_failed' red so
  // the operator can Retry; 'delete_pending' shows a neutral spinner.
  hubspotSyncState:
    | "not_synced"
    | "synced"
    | "failed"
    | "delete_pending"
    | "delete_failed";
  /**
   * Cycle 2 — soft-delete metadata (parity with PublicDocument). Both
   * null = alive; `deletedAt` set = soft-deleted. The Saved-calculators
   * list renders a "Deleted" badge + the reason and (super_admin) a
   * Restore button when `deletedAt` is non-null.
   */
  deletedAt: string | null;
  deletionReason: DocumentDeletionReason | null;
  /**
   * Sprint 9.N — last action surfaced from the events log by the
   * listing endpoint's LATERAL JOIN. Drives the "Last action"
   * column on /calculators. Null on single-row endpoints + when
   * no events have been recorded yet.
   */
  lastEvent?: PublicLastEvent | null;
  /**
   * Sprint 9.X.A — display surrogate for the calc's creator, sourced
   * from the listing endpoint's LEFT JOIN on `users.created_by_user_id`.
   * Renders below the Updated timestamp on /calculators ("Created by
   * Super Admin"). Nullable because the FK is ON DELETE SET NULL;
   * optional because single-row endpoints don't JOIN this.
   */
  createdBy?: { displayName: string; email: string } | null;
}

/**
 * Sprint 9.N — shape of the "last action" surrogate carried by
 * the listing endpoints (documents + calculator-configs). The
 * actor fields are nullable: actor_user_id is null for system
 * events (background auto-sync) or after the user was deleted
 * (ON DELETE SET NULL on the FK).
 */
export interface PublicLastEvent {
  eventType: string;
  createdAt: string; // ISO timestamp
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
}

/**
 * Sprint 6.9 S12: narrow shape for items returned by the LIST
 * endpoint of calculator-configs. Mirrors PublicDocumentListItem
 * — companyName is REQUIRED here because the repository's INNER
 * JOIN guarantees it.
 */
export type PublicCalculatorConfigListItem = PublicCalculatorConfig & {
  companyName: string;
  // Sprint 9.Y.A M1 audit fix — tighten createdBy on the listing
  // shape from optional to REQUIRED (still nullable). The listing
  // repository's LEFT JOIN always populates this field — either the
  // creator surrogate or explicit `null`. Marking it required here
  // forces list-rendering call sites to handle both branches
  // (without the fix, `cfg.createdBy?.displayName` was accepted but
  // could mask a wiring regression).
  createdBy: { displayName: string; email: string } | null;
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
  // Phase 8 Stage 5 widened the enum with the delete-flow transition
  // states. The detail-page badge renders each value with its own
  // colour ('delete_pending' = neutral spinner, 'delete_failed' = red).
  hubspotSyncState:
    | "not_synced"
    | "synced"
    | "failed"
    | "delete_pending"
    | "delete_failed";
  hubspotNoteId: string | null;
  createdByUserId: string;
  // Phase 8 Stage 5 — soft-delete metadata. All four nullable; the
  // backend's CHECK constraint enforces that deletedAt + deletedBy
  // move together (both null = alive, both non-null = soft-deleted).
  deletedAt: string | null;
  deletedByUserId: string | null;
  /**
   * Sprint 9.O — denormalised display info for the deleter. Comes from
   * a LEFT JOIN on users.deleted_by_user_id at the single-document
   * endpoint (the listing endpoint omits it — too noisy + each row
   * already shows lastEvent.actor). Null on alive docs and also on the
   * defensive "deleter row missing" path.
   */
  deletedBy: { displayName: string; email: string } | null;
  /**
   * Sprint 9.X.A — display surrogate for the document's creator,
   * sourced from the listing endpoint's LEFT JOIN on
   * `users.created_by_user_id`. Renders below the CREATED timestamp
   * on /documents ("Created by Super Admin"). Nullable because the FK
   * is ON DELETE SET NULL; optional because single-doc endpoints don't
   * JOIN this.
   */
  createdBy?: { displayName: string; email: string } | null;
  deletionReason: DocumentDeletionReason | null;
  deletionNote: string | null;
  /**
   * Sprint 9.N — last action surfaced from the events log by the
   * listing endpoint's LATERAL JOIN. Drives the "Last action"
   * column on /documents. Null on single-row endpoints + when no
   * events have been recorded yet.
   */
  lastEvent?: PublicLastEvent | null;
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
  // Sprint 9.Y.A M1 audit fix — mirror PublicCalculatorConfigListItem:
  // listing repo's LEFT JOIN always returns either the creator
  // surrogate or explicit null, so the listing shape promises the
  // field is present (still nullable). Single-doc fetches use the
  // base PublicDocument type where the field is optional.
  createdBy: { displayName: string; email: string } | null;
};

/**
 * Phase 8 Stage 5 — soft-delete reason enum mirrors the server
 * `documents.deletion_reason` CHECK constraint. The FE delete
 * modal exposes these as a dropdown.
 */
export type DocumentDeletionReason =
  | "client_request"
  | "created_in_error"
  | "replaced_by_new_version"
  | "duplicate"
  | "other";

// ─── Event log (Phase 8 Stage 4) ──────────────────────────────────
/**
 * Mirrors server/modules/events/events.schemas.ts:publicEventSchema.
 * One shape on the wire for both document_events and
 * calculator_config_events; the FE History panel renders both with
 * the same component.
 *
 * `actorUserId / actorDisplayName / actorEmail` are nullable because:
 *   - some events are recorded by the background auto-sync (actor=null)
 *   - if the original actor user is later deleted, ON DELETE SET NULL
 *     in the FK keeps the event row alive with a null actor pointer
 */
export interface PublicEvent {
  id: string;
  eventType: string;
  meta: Record<string, unknown>;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  createdAt: string; // ISO timestamp
}

export interface PublicEventsListResponse {
  items: PublicEvent[];
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
