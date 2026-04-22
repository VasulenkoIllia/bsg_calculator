# Phase 02 Plan: Zone 2 (Introducer Commission)

Date: 2026-04-22  
Status: Completed

## Source
- Primary source: `/Users/monstermac/WebstormProjects/bsg_calculator/Calculator_Описание.docx`
- Section: `ZONE 2: INTRODUCER COMMISSION`

## Phase goal
Implement Zone 2 fully as an independent module + UI block with dynamic recalculation and deterministic tests.

## Scope
1. Introducer commission type selection:
- `Standard`
- `Custom`
- `Rev Share`

2. Standard model (retrospective, non-progressive):
- Tiers:
  - Tier 1: `€0-10M` -> `€2,500` per `€1M`
  - Tier 2: `€10M-25M` -> `€5,000` per `€1M`
  - Tier 3: `>€25M` -> `€7,500` per `€1M`
- Rule: single tier applied to full selected volume.
- Example from doc: `18M -> Tier2 -> 18 × 5,000 = 90,000`.

3. Custom model (progressive):
- 3 tiers, configurable boundaries (default `10M`, `25M`).
- Tier amounts are charged progressively by volume slices.
- Example from doc:
  - `10M × 2,500 = 25,000`
  - `8M × 5,000 = 40,000`
  - Total `65,000`.

4. Rev Share model:
- Partner share numeric input `0-50%` (default `25%`, step `5%`).
- Formula:
  - `marginBeforeSplit = totalRevenue - totalCosts`
  - `partnerShare = marginBeforeSplit × share%`
  - `ourMargin = marginBeforeSplit - partnerShare`
- Example from doc:
  - Margin `50,000`
  - Share `25%`
  - Partner `12,500`
  - Our margin `37,500`.

5. UI behavior:
- Zone 2 appears as separate collapsible zone (same compact UX pattern).
- Formula breakdown displayed for each selected commission type.
- Dynamic recalculation on every input change.

## Architecture / files (target)
- Domain:
  - `src/domain/calculator/zone2/introducerCommission.ts`
  - `src/domain/calculator/zone2/introducerCommission.test.ts`
- UI wiring:
  - `src/App.tsx`
- Exports:
  - `src/domain/calculator/index.ts`

## Acceptance checklist
- All Zone 2 fields implemented and readable.
- All 3 models implemented with doc examples covered by tests.
- Breakdown formulas visible in UI.
- Works in Payin-only, Payout-only, and both-enabled mode.
- Recalculation is immediate.
- Existing zone behavior/regression tests stay green.

## Test plan
1. Unit tests:
- Standard model tier selection and full-volume application.
- Custom model progressive slice math with default boundaries.
- Rev Share partner/our margin split.
- Edge cases: zero/negative guarded input, boundary edges (`10M`, `25M`).

2. UI tests:
- Type switch between Standard/Custom/Rev Share.
- Breakdown lines update when inputs change.
- Collapse/expand behavior for Zone 2.

3. Gate:
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Notes
- If zone integration with profitability totals introduces ambiguity, record it in:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/docs/calculator_spec_open_questions.md`

## Progress snapshot (2026-04-22)
- Implemented domain module:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone2/introducerCommission.ts`
- Added unit tests for all 3 commission models:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone2/introducerCommission.test.ts`
- Exported module through:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/index.ts`
- Wired full Zone 2 UI in:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.tsx`
  - model switch (`Standard` / `Custom` / `Rev Share`)
  - configuration inputs for each model
  - formula breakdown and total commission output
  - per-result formula traces with substituted values
  - zone collapse/expand support
- Added UI tests:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.test.tsx`
- Gate status:
  - `npm run typecheck` passed
  - `npm run test` passed (`22` tests total)
  - `npm run build` passed

## Block Freeze (2026-04-22)
- Status: Zone 0/1/2 current implementation is fixed for this phase and can be treated as baseline.
- Verification at freeze point:
  - `npm run typecheck` passed
  - `npm run test` passed (`22` tests total)
  - `npm run build` passed
- Important forward dependencies (expected, not blockers for current freeze):
  - `Rev Share -> Total Revenue (€)` and `Total Costs (€)` are auto-wired from Zone 5 Payin totals.
  - `Commission Base Volume (€) - Auto` is fixed to Payin monthly volume only (no Payin+Payout sum).
  - Formula traces must be preserved and extended the same way for all future zones with calculations.
