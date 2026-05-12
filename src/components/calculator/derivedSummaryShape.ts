// Derived-summary shape — what backend persists in
// `calculator_snapshots.derived_summary` JSONB.
//
// The live `useCalculatorDerivedData` hook in this folder produces a
// large set of memoised values from the calculator snapshot input
// (traffic, profitability, formulas tree, …). Phase 8 backend stores
// a STABLE SUBSET of those values alongside the raw snapshot so:
//   - PDF re-render does not need to recompute everything (snapshot
//     + derived = full document context).
//   - Listing / search / dashboards can show top-line numbers without
//     hitting the full math layer.
//
// This file is the source of truth for that subset. The live hook
// already produces every field below — wiring it to actually emit
// this shape is a downstream task (see decomposition note below).
//
// IMPORTANT: pure, no React imports — must remain Node-loadable for
// Zod codegen and future server-side rebuild scripts.
//
// Status (2026-05-12):
//   - Contract defined here (this file).
//   - Today the hook does NOT yet emit a "summary" packed in this
//     shape — it returns the full computed tree for React rendering.
//     Building `extractDerivedSummary(hook): DerivedSummaryPayload`
//     is a follow-up once the backend endpoint exists. The hook's
//     individual memos already match this shape one-for-one, so the
//     extraction is mechanical.
//
// See also:
//   - `snapshotShape.ts` — the persisted INPUT (snapshot payload).
//   - `docs/backend_computation_boundary.md` — what backend
//     recomputes vs. trusts from a stored summary.

import type {
  OtherRevenueProfitabilityResult,
  PayinProfitabilityResult,
  PayoutProfitabilityResult,
  TotalProfitabilityResult
} from "../../domain/calculator/index.js";

export interface DerivedSummaryPayload {
  // Schema version for the derived contract — bumps independently of
  // `CalculatorSnapshotPayload.schemaVersion` so a recompute can
  // upgrade just this side without touching stored snapshots.
  schemaVersion: 1;

  // Mirrors the hook's `payinProfitability` (Zone 5 payin block).
  // The result is precomputed at snapshot-save time so listing pages
  // can render the EU/WW revenue+cost+margin without re-executing
  // `calculatePayinProfitability` for every row.
  payin: PayinProfitabilityResult;

  // Mirrors the hook's `payoutProfitability` (Zone 5 payout block).
  payout: PayoutProfitabilityResult;

  // Mirrors the hook's `otherRevenueProfitability` (Zone 5 misc fees).
  other: OtherRevenueProfitabilityResult;

  // Mirrors the hook's `totalProfitability` — the bottom-line numbers
  // dashboards and HubSpot syncs care about.
  total: TotalProfitabilityResult;

  // Bottom-line scalar margins — duplicated from `total` for cheap
  // SQL-side ordering / filtering without needing JSONB introspection.
  // (e.g. `WHERE (derived_summary->>'ourMarginEuro')::numeric > 0`)
  ourMarginEuro: number;
  totalRevenueEuro: number;
  totalCostsEuro: number;
}

// Backend Zod note:
//   PayinProfitabilityResult / PayoutProfitabilityResult / TotalProfitabilityResult
//   are exported from `domain/calculator/zone5/types.ts`. The backend
//   Zod schemas mirror those interfaces — keep them in lock-step or
//   bump `schemaVersion` above.
