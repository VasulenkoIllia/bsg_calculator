/**
 * Zod schemas for the documents API.
 *
 * Mirror the documents.payload shape locked in decisions.md
 * "Pre-Sprint 4 — Documents UX + payload shape + template flow"
 * (Q2): calc snapshot + wizard meta in one JSONB blob.
 *
 * The payload schema is permissive (`.passthrough()`) on the same
 * grounds as calculator-configs: full domain validation lives on
 * the frontend; we only enforce the schemaVersion required field.
 */

import { z } from "zod";

// ─── Scope enum ──────────────────────────────────────────────────────
/**
 * Document type. Matches the CHECK constraint on documents.scope.
 * `offer_and_agreement` = "both" — wizard last step renders 3 buttons
 * when this is selected, but the user saves a SINGLE document with
 * scope=offer_and_agreement that contains both renderings.
 */
export const documentScopeSchema = z.enum([
  "offer",
  "agreement",
  "offer_and_agreement"
]);
export type DocumentScope = z.infer<typeof documentScopeSchema>;

// ─── Payload ────────────────────────────────────────────────────────
/**
 * Permissive check — full validation lives on the frontend's
 * extractCalculatorSnapshot + wizard-meta build helpers. We just need
 * `schemaVersion` to be present so future migration logic can decide
 * whether to re-hydrate via legacy adapters.
 */
const payloadSchema = z
  .object({
    schemaVersion: z.number().int().positive()
  })
  .passthrough();

// ─── Create body ────────────────────────────────────────────────────
/**
 * POST /api/v1/documents body.
 *
 * Three flows produce the same shape; the service decides what each
 * field means contextually:
 *   - Flow A (from calc): caller provides `calculatorConfigId`;
 *     service loads the calc, merges with wizard meta from `payload`.
 *   - Flow B (use as template): the /:number/use-as-template route
 *     calls this internally with `calculatorConfigId=null` —
 *     payload carries the full new snapshot.
 *   - Flow C (direct clone): caller skips calculatorConfigId, posts
 *     the full payload directly. Rare; mostly for import scripts.
 */
export const createDocumentSchema = z.object({
  companyId: z.string().uuid({ message: "companyId must be a UUID" }),
  hubspotDealId: z.string().min(1).max(64).nullable().optional(),
  calculatorConfigId: z.string().uuid().nullable().optional(),
  scope: documentScopeSchema,
  payload: payloadSchema,
  addendum: z.string().trim().max(8_000).nullable().optional()
});
export type CreateDocumentRequest = z.infer<typeof createDocumentSchema>;

// ─── List query ─────────────────────────────────────────────────────
export const listDocumentsQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  hubspotDealId: z.string().min(1).max(64).optional(),
  // Sprint 6.4: filter documents by their source calculator-config id.
  // Powers the "Documents from this calculator" section on /calc/:id —
  // the operator sees every BSG-XXXXX document derived from a specific
  // calc draft.
  calculatorConfigId: z.string().uuid().optional(),
  scope: documentScopeSchema.optional(),
  // Substring search on number ("7100024" matches "BSG-7100024").
  q: z.string().trim().min(1).max(64).optional(),
  // Sprint 6.8: per-column sort. Format: "field:dir" where field is
  // one of {number, companyName, scope, hubspotSyncState, createdAt}
  // and dir is "asc" or "desc". Default: "createdAt:desc" (matches
  // pre-6.8 behaviour). Allowed values are validated by the service
  // via `parseSortQuery` — this schema accepts any short string so
  // the error surface is a single VALIDATION_FAILED from the parser.
  // Sprint 6.9 N2: relaxed from /^[a-zA-Z]+:.../ to allow digits +
  // underscores in the field segment. Future field names like
  // `zone1` or `created_at` (snake-case alternative) would have been
  // pre-rejected by Zod before parseSortQuery could whitelist-validate.
  // The security boundary is still the whitelist in
  // `parseSortQuery` — this regex is shape pre-filter only.
  sort: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z][\w]*:(asc|desc)$/, {
      message: "sort must be in 'field:asc' or 'field:desc' form"
    })
    .optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  // Phase 8 Stage 5 — soft-delete visibility. 'alive' (default)
  // hides deleted rows. 'deleted_only' / 'include_deleted' are
  // gated to super_admin at the controller layer (regular operators
  // would otherwise see retracted documents on /documents).
  includeDeleted: z
    .enum(["false", "true", "only"])
    .optional()
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// ─── Public DTO ─────────────────────────────────────────────────────
export const documentPublicSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  companyId: z.string().uuid(),
  /**
   * Sprint 6.8: surfaced only by the LIST endpoint (JOIN companies).
   * Single-doc fetch (GET /documents/:number) omits it because the
   * detail page already loads the full company elsewhere.
   */
  companyName: z.string().optional(),
  hubspotDealId: z.string().nullable(),
  calculatorConfigId: z.string().uuid().nullable(),
  scope: documentScopeSchema,
  payload: z.unknown(),
  addendum: z.string().nullable(),
  // Phase 8 Stage 5 widened the enum with the delete-flow transition
  // states. The FE renders each value with its own badge colour.
  hubspotSyncState: z.enum([
    "not_synced",
    "synced",
    "failed",
    "delete_pending",
    "delete_failed"
  ]),
  hubspotNoteId: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  // Phase 8 Stage 5 — soft-delete metadata. All four fields are
  // null on alive rows. The migration's consistency CHECK enforces
  // that deletedAt + deletedByUserId move together.
  deletedAt: z.string().nullable(),
  deletedByUserId: z.string().uuid().nullable(),
  deletionReason: z
    .enum([
      "client_request",
      "created_in_error",
      "replaced_by_new_version",
      "duplicate",
      "other"
    ])
    .nullable(),
  deletionNote: z.string().nullable(),
  /**
   * Sprint 9.O — display surrogate for the actor who soft-deleted
   * the row. Populated by `findByNumberWithDeleter` (single-doc
   * fetch) via LEFT JOIN on `users`. Null on listings + when the
   * doc is alive.
   */
  deletedBy: z
    .object({
      displayName: z.string(),
      email: z.string()
    })
    .nullable()
    .optional(),
  /**
   * Sprint 9.N — last action surfaced from `document_events` via
   * LATERAL subquery on the listing endpoint. Null on single-doc
   * fetch (different code path doesn't JOIN events). Powers the
   * "Last action" column on the FE listing.
   */
  lastEvent: z
    .object({
      eventType: z.string(),
      createdAt: z.string(),
      actorUserId: z.string().uuid().nullable(),
      actorDisplayName: z.string().nullable(),
      actorEmail: z.string().nullable()
    })
    .nullable()
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type DocumentPublic = z.infer<typeof documentPublicSchema>;

// ─── Delete body ────────────────────────────────────────────────────
/**
 * Phase 8 Stage 5 — DELETE /api/v1/documents/:number body.
 *
 * `note` is REQUIRED (≥ 1 char) when reason='other'. The Zod refine
 * encodes that contract at the schema layer so the service body just
 * destructures the validated values.
 */
export const deleteDocumentSchema = z
  .object({
    reason: z.enum([
      "client_request",
      "created_in_error",
      "replaced_by_new_version",
      "duplicate",
      "other"
    ]),
    note: z.string().trim().max(8_000).nullable().optional()
  })
  .refine(
    data => data.reason !== "other" || (data.note && data.note.length > 0),
    {
      path: ["note"],
      message: "Note is required when reason is 'other'"
    }
  );
export type DeleteDocumentRequest = z.infer<typeof deleteDocumentSchema>;
