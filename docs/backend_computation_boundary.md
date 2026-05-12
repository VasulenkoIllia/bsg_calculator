# Backend Computation Boundary

What gets recomputed server-side vs. what backend trusts from the
stored snapshot/summary blobs. Pinning the boundary now prevents
"stored PDF says €120k but listing says €115k" drift later.

---

## TL;DR

| Resource | Source of truth | Backend behaviour |
|---|---|---|
| `calculator_snapshots.payload` | Frontend `extractCalculatorSnapshot()` | Trust as-is. Validate via Zod, then store JSONB verbatim. |
| `calculator_snapshots.derived_summary` | Frontend hook (today); pure `extractDerivedSummary()` to be built | Trust the stored summary for listing/dashboard reads. **Recompute** when rendering a PDF or syncing to HubSpot. |
| `documents.payload` | Frontend `buildDocumentTemplatePayloadFromCalculator()` | Trust as-is — the payload IS the rendering input. Backend writes once at confirm time and never mutates. |
| `documents.pdf_html` (if stored) | Server-side `buildOfferPdfHtml(payload)` | Always recompute on save. The HTML is a snapshot of the payload at the moment of confirm. |

---

## Rule 1 — Snapshots are immutable inputs

After `POST /calculator-snapshots`, the row is read-only. The payload
JSONB is the deterministic input to every downstream computation. The
backend never edits a stored snapshot — the operator clones it
(`POST /calculator-snapshots/:id/clone`, see `ui_phase_8_9_requirements.md`)
which creates a fresh row.

This means: when the math layer changes (e.g. a calculator formula is
updated), historical snapshots stay readable, and PDFs re-rendered
from them reflect the NEW math against the OLD inputs. If product
wants frozen renders, store the rendered HTML alongside the snapshot
at the time of first render.

---

## Rule 2 — Derived summaries are convenience cache, not truth

`calculator_snapshots.derived_summary` is a precomputed view (revenue
/ cost / margin numbers) stored as JSONB next to the snapshot.

**Use for:**
- Documents listing page (`docs/ui_phase_8_9_requirements.md` §1)
- HubSpot deal-property writes (Phase 9)
- Dashboards / SQL ordering (the `ourMarginEuro` / `totalRevenueEuro`
  / `totalCostsEuro` scalars on the summary exist exactly for this)

**Do NOT use for:**
- PDF rendering — always recompute from the snapshot. The PDF must
  match the saved payload regardless of when it's rendered.
- Decisions that change billing (e.g. "this contract crossed the
  rev-share threshold") — recompute from the snapshot.

**Recompute trigger:** if the math layer changes, the backend SHOULD
have a script that walks stored snapshots and rewrites their
`derived_summary` blobs (`schemaVersion` bump + backfill). Document
the migration runbook in `phase_08_backend_plan.md` § operations.

---

## Rule 3 — Documents are content snapshots

`documents.payload` (`DocumentTemplatePayload` shape) is the rendering
input for the OFFER PDF + optional MSA. Once `documents.status` moves
past `draft`, the row is locked from edits.

**Server-side compute responsibilities at `POST /documents`:**
1. Allocate a `BSG-#####` number via the numbering service (overwrites
   any `header.documentNumber` the client supplied — the frontend
   sends a placeholder `BSG-DRAFT-…`).
2. Set `documents.created_at`.
3. Resolve `client_id` from the side-channel param (NOT from
   `payload.*` — see `client_and_hubspot_workflow.md`).
4. Optionally render the PDF immediately and store `pdf_html` on the
   row. Decided per the Phase 8 plan; Puppeteer endpoint exists in
   the same service.

**Server-side compute responsibilities on read (`GET /documents/:id`):**
- None. Return the row.
- For "render now" responses: load the row, call `buildOfferPdfHtml(payload)`
  on the server (Node, after the small extraction in `src/shared/html.ts`
  and the type guarantees from `tsconfig.server.json`), pipe HTML
  through Puppeteer.

**Server-side compute on clone (`POST /documents/:id/clone`):**
- Copy `payload` verbatim.
- Allocate a new `BSG-#####`.
- Set `parent_document_id = source.id`.
- New row's `status = draft`, `hubspot_links = null`.
- The source stays untouched.

---

## Rule 4 — HubSpot writes recompute from the snapshot

When Phase 9 ships HubSpot sync, the backend builds the property
payload by:
1. Loading `documents.payload`.
2. Loading the linked `calculator_snapshots.payload` (via
   `documents.source_calculator_snapshot_id`).
3. **Recomputing** the derived summary (do NOT trust the stored one
   for this — it might be stale relative to the latest math layer).
4. Mapping selected fields onto HubSpot deal properties / company
   properties / a note attachment with the PDF.

The mapping table itself is out of scope for this doc — see
`docs/integrations.md` and the future Phase 9 plan.

---

## Frontend invariants the backend can rely on

These are enforced by `tsconfig.server.json` + the shape modules. If
any of them stops being true, ESLint/tsc breaks the build and the
backend boundary needs a re-think:

- `src/domain/calculator/**` imports no React, no DOM, no fetch.
- `src/shared/html.ts` is Node-safe (escapeHtml only).
- `src/components/calculator/snapshotShape.ts` and
  `derivedSummaryShape.ts` import only TS types — no React, no DOM.
- `src/components/document-wizard/wizard/layoutHelpers.ts` is pure.
- `src/components/document-wizard/types.ts` is types-only (no runtime).

These five surfaces are the ENTIRE frontend → backend extraction map.
Anything outside them is React-only and stays in the SPA.

---

## Compute-boundary cheat-sheet for backend authors

```
                  +------------------+
                  |  Operator UI     |   (frontend, React)
                  +------------------+
                          │
              extractCalculatorSnapshot()
                          │ JSON
                          ▼
                  +------------------+
                  |  POST /snapshots |   (Express + Zod)
                  +------------------+
                          │ persists
                          ▼
                  +------------------+
                  |  calculator_     |   (Postgres JSONB)
                  |  snapshots row   |   payload + derived_summary
                  +------------------+

When operator confirms a document:

                  +------------------+
                  |  WizardPage      |
                  +------------------+
                          │
              fromCalculator → DocumentTemplatePayload
                          │ JSON + clientId
                          ▼
                  +------------------+
                  |  POST /documents |   (allocates BSG-#####,
                  +------------------+    optionally renders PDF
                          │                via Puppeteer)
                          ▼
                  +------------------+
                  |  documents row   |   payload (immutable post-draft)
                  +------------------+
```

When rendering a PDF:

```
GET /documents/:id/pdf
  ├─ load documents row
  ├─ buildOfferPdfHtml(row.payload)   [Node-side import; pure]
  ├─ Puppeteer headless render
  └─ stream PDF response
```

When pushing to HubSpot (Phase 9):

```
POST /documents/:id/hubspot-sync
  ├─ load documents row
  ├─ load linked calculator_snapshots row
  ├─ extractDerivedSummary(snapshot.payload)  [recompute; do NOT trust stored]
  ├─ map to HubSpot properties + note attachment
  ├─ call HubSpot API
  └─ write hubspot_links + last_sync_at on documents row
```

---

## Cross-references

- `docs/backend_state_schemas.md` — Zod-ready type contracts.
- `docs/client_and_hubspot_workflow.md` — Phase 8 vs Phase 9 client flow.
- `docs/ui_phase_8_9_requirements.md` — listing / view / clone UI.
- `docs/phase_08_backend_plan.md` — full backend plan.
- `docs/calculator_logic_and_formulas.md` — the math the recomputes use.
