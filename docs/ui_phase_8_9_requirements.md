# UI Requirements — Phase 8 backend & Phase 9 HubSpot

Captured 2026-05-12 during the pre-Phase-8 audit. These requirements
were raised verbally and need to be discussed before backend kickoff,
but they are recorded here so they do not get lost while the team
finishes the frontend freeze.

This is a **scope brief**, not a finalised spec. Treat every bullet as
a discussion seed for the planning meeting.

---

## 1. Documents Listing Page (NEW)

A dedicated page listing all generated documents (offers / agreements /
calculator snapshots) per client, with HubSpot status visible per row.

**Mandatory columns (subject to refinement):**
- Document number (`BSG-#####` or `BSG-#####-XXXXX`)
- Type (Calculator Snapshot · Offer · Offer + Agreement · …)
- Client (name + optional HubSpot company link)
- Created date
- Created by (operator / sales rep)
- Status (`draft` · `confirmed` · `sent_to_hubspot` · `superseded` …)
- HubSpot sync info — when synced, what was pushed, link to HubSpot
  deal / company / note

**Filters (must-have):**
- Date range (created)
- Client (autocomplete from the clients table; eventually HubSpot
  companies in Phase 9)
- Document type
- Status (`sent_to_hubspot` is a common filter — "show me everything
  I have not yet pushed")

**Filters (nice-to-have):**
- Created-by (operator)
- Calculator preset / model (Blended vs IC++, EU-only vs Global vs …)
- HubSpot sync result (success / failed / pending)

**Open questions:**
- Pagination vs infinite scroll? With BSG-##### numbering and typical
  Phase 8 volumes, a simple paginated list of 50/page is enough.
- Row actions — at minimum "view" and "clone as new draft" (see §3).
- Bulk actions — "mark as superseded" or "export to CSV" later phase.

**Backend implication:**
- New endpoint `GET /api/v1/documents?filters` returning paginated
  rows with the columns above.
- `documents.status` (and possibly `documents.hubspot_sync_state`)
  needs explicit enum values defined in the Phase 8 plan. Current
  plan has `documents.status` but its allowed values are not listed.

---

## 2. Shareable Configuration Links → View Mode (NEW)

Today the calculator + wizard are operator-only: opening the app puts
the user in edit mode. With Phase 8 persistence and HubSpot linking,
the same artefacts need to be **shareable** as read-only previews.

**Behaviour:**
- A "Share configuration" button on the calculator and wizard produces
  a permalink (e.g. `/view/calc/<snapshot-id>` or
  `/view/document/<document-id>`).
- Recipient opens the link → lands on a **view-only** page rendering
  the same calculator zones or document preview, but with no
  editable inputs.
- The view page must clearly indicate read-only state (banner
  "Read-only preview · created YYYY-MM-DD · #BSG-#####").

**Open questions:**
- Auth on view links — are they authenticated (operator-only) or
  signed-token public links (e.g. for sharing with the merchant)?
  Defaults: Phase 8 authenticated-only; Phase 9 may add signed
  public-token links.
- View page lifetime — do we lock the snapshot/document so it cannot
  be edited after sharing? Recommendation: documents are immutable
  once `status = confirmed` (or any post-draft status); calculator
  snapshots are immutable by default (they are point-in-time captures).
- "Clone as new draft" entry point (§3) lives on the view page.

**Backend implication:**
- New endpoints `GET /api/v1/calculator-snapshots/:id` and
  `GET /api/v1/documents/:id` returning the full payload + metadata,
  with the auth model decided above.
- React routes `/view/calc/:id` and `/view/document/:id` rendering
  read-only versions of the existing pages. The existing calculator
  and wizard components must be parameterised to accept a `readOnly`
  flag (or a separate `<CalculatorView>` component reads the same
  derived hooks but disables every input).

**Frontend implication for the freeze:**
- Item D1 / D2 (split state hooks) is a precondition. Read-only view
  needs `useCalculatorBusinessState` to load from a server-provided
  snapshot rather than from `useState` defaults. Decomposing the
  hook makes that injection trivial.

---

## 3. Clone-as-New-Draft (NEW)

From a view page (§2), the operator can create a new draft based on
the viewed snapshot or document. The new draft gets a fresh document
number; the source artefact stays immutable.

**Behaviour:**
- "Create new draft from this" button on the view page.
- Clicking it allocates a new `BSG-#####` number, copies the source
  payload into a new draft row, and navigates to the edit page
  (`/calculator?source=snapshot&id=<new-snapshot-id>` or
  `/wizard?source=document&id=<new-document-id>`).
- The new draft tracks its lineage:
  `parent_snapshot_id` / `parent_document_id` columns on the new
  row. Useful for "show me what this was cloned from" and for
  HubSpot audit trails.
- The source artefact is **never** modified — the new draft is a
  full payload copy.

**Open questions:**
- Should the new draft auto-link to the same client as the source?
  Default: yes, but allow the operator to change before confirming.
- HubSpot status — the new draft starts at `status = draft` with no
  HubSpot links, even if the source was synced.
- Numbering — Phase 8 plan has `BSG-#####` for documents; how does
  cloning interact with the Phase 9 `BSG-#####-XXXXX` revision
  numbering? Recommendation: clones get a new top-level number
  (`BSG-#####`); revisions of the same document keep the parent
  number with an incremented `-XXXXX` suffix. To be confirmed.

**Backend implication:**
- New endpoints `POST /api/v1/calculator-snapshots/:id/clone` and
  `POST /api/v1/documents/:id/clone`.
- DB schema additions: `parent_snapshot_id`, `parent_document_id`
  (both nullable; FK self-reference). Phase 8 plan already mentions
  `sourceCalculatorSnapshotId` on documents — extend the same
  pattern.
- Numbering service issues the new `BSG-#####` for the clone, same
  as a fresh creation.

**Frontend implication for the freeze:**
- D1 (split state) again — the new draft entry point loads the
  parent payload into `useCalculatorBusinessState` and starts a
  fresh edit session. Same injection seam as §2.

---

## 4. HubSpot Status Tracking (NEW)

Today HubSpot is fully deferred. Once Phase 9 lands, the documents
listing (§1) needs visible HubSpot status per row. Capturing the
shape here so Phase 8 schema can leave room for it without committing
to the sync logic yet.

**Per-document HubSpot state (Phase 9):**
- `hubspot_sync_state` enum: `not_synced` · `pending` · `synced` ·
  `failed`.
- `hubspot_links` JSONB blob: `{ companyId, dealId?, noteId? }` —
  the IDs of the HubSpot artefacts created during sync. Phase 8 plan
  already mentions this column — confirm it as JSONB.
- `last_sync_at` timestamp, `last_sync_error` text (nullable).

**View on the listing page:**
- Status pill per row ("Synced · 2026-05-12 14:30", "Not synced",
  "Sync failed — retry?").
- Click row → opens detail panel with full sync info: what fields
  were pushed, what HubSpot returned, retry button if failed.

**Backend implication:**
- Phase 8 should add the `hubspot_*` columns to `documents` as
  nullable from day one, even if no code writes to them yet.
  Saves a migration when Phase 9 starts.
- A separate `hubspot_sync_log` table is optional — useful if we
  need an audit trail of every sync attempt vs. just the latest.

---

## Discussion checklist for the planning meeting

- [ ] Confirm the listing page column set and filter set (§1).
- [ ] Decide auth model for shareable view links (§2) — operator-only
      vs signed public tokens.
- [ ] Confirm immutability rules: which document statuses are locked,
      which can still be edited.
- [ ] Decide clone numbering semantics (§3) — new top-level number
      vs revision suffix.
- [ ] Confirm HubSpot column shape (§4) for Phase 8 schema even though
      no code writes to them yet.
- [ ] Add the listing page, view pages, and clone endpoints to the
      Phase 8 plan as explicit items (currently absent).
- [ ] Walk through the decomposition items D1-D3 with the team — they
      are preconditions for the view-mode rendering and the clone
      flow.

---

## Cross-references

- Phase 8 backend plan: `docs/phase_08_backend_plan.md`
- HubSpot integration boundary (to be written): `docs/client_and_hubspot_workflow.md`
- Backend state schemas (to be written): `docs/backend_state_schemas.md`
- Computation boundary (to be written): `docs/backend_computation_boundary.md`
- Existing architecture overview: `docs/architecture.md`
