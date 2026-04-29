# Phase 05 Handoff: Zone 5 (Profitability Calculations)

Date: 2026-04-22  
Status: Completed (phase scope)

Update: 2026-04-28
- Clarified Zone 5 payin cost presentation without changing calculation formulas.
- `Total Payin Costs` is displayed as `EU Costs + WW Costs`.
- Each regional cost breakdown now shows provider MDR tiers, provider TRX CC/APM, and Scheme Fees.
- Scheme Fees remain costs only for `Blended`; for `IC++` they have `€0` cost impact.

Update: 2026-04-29
- Interchange is removed from payin cost formulas and has `€0` impact.
- Provider MDR is now tiered on total payin volume (`EU + WW`) and then allocated to EU/WW by volume share.
- 3DS revenue/cost rows are displayed under `Payin Revenue & Costs`, split by EU/WW, and included in Total Payin revenue/cost totals.
- In unified hierarchy, `3DS Revenue (EU/WW)` rows are nested under `Total Payin Revenue` and `3DS Costs (EU/WW)` rows are nested under `Total Payin Costs`.
- Unified `Payin Net Margin` child row is removed as duplicate; its formula is kept on parent `Payin Revenue & Costs`.
- Unified `Payout Net Margin` child row is removed as duplicate; its formula is kept on parent `Payout Revenue & Costs`.
- Unified `Total Payout Costs` now expands both Provider MDR tiers and Provider TRX tier formulas.
- `Other Revenue` now includes only Settlement Fee and Monthly Minimum Adjustment.

## 1) Completed zone/module
- Zone 5: `Profitability Calculations`
- Covered sections:
  - `TOTAL PROFITABILITY` card with mode-aware layout:
    - `Standard/Custom`: Payin Net + Payout Net + Other Revenue -> Total Margin -> minus Introducer.
    - `Rev Share`: Total Revenue - Total Costs -> margin before split -> partner share -> Our Margin.
  - Main categories:
    - `Payin Revenue & Costs`
    - `Payout Revenue & Costs`
    - `Other Revenue`
    - `Introducer Commission`
  - Formula lines under results with substituted input values.
  - Added unified final summary block in Zone 5 with:
    - global `Expand All`,
    - global `Collapse All`,
    - `Show Formulas` toggle,
    - hierarchical one-place breakdown tree for totals and nested sub-calculations.
  - Warning visibility for:
    - payout minimum fee application,
    - monthly minimum fee application,
    - negative margin.
  - Zone-level collapse/expand support.

## 2) Files changed
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.test.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/index.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone5/profitability.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone5/profitability.test.ts`

## 3) DOCX rules covered in this phase
Source: `Calculator_Описание.docx`, section `ZONE 5: PROFITABILITY CALCULATIONS`.

- Implemented deterministic profitability engine for:
  - Payin revenue/cost/net aggregation,
  - Payout revenue/cost/net aggregation,
  - Other revenue net (3DS, settlement, monthly minimum adjustment),
  - Total profitability totals.
- Added provider-cost calculations:
  - Payin provider MDR progressive tiers (`1.70% / 1.50% / 1.40%`),
  - Payout provider MDR progressive tiers (`1.00% / 1.00% / 1.00%`),
  - Payout provider TRX tiers (`€0.40 / €0.40 / €0.40`),
  - Payin provider TRX defaults (`CC €0.22`, `APM €0.27`).
- Rev Share in Zone 2 now receives `Total Revenue` and `Total Costs` automatically from Zone 5 totals (read-only source).

## 4) Tests added/passed
- Unit tests:
  - `zone5/profitability.test.ts` covers:
    - payin region profitability (IC++ / blended),
    - payin EU+WW aggregation,
    - payout profitability,
    - other revenue,
    - total profitability for standard/custom and rev share,
    - negative margin warning.
- UI tests:
  - `App.test.tsx` now covers:
    - Zone 5 rendering,
    - profitability recalculation on zone interactions,
    - zone collapse/expand for Zone 5.

Gate results:
- `npm run typecheck` passed
- `npm run test` passed (`45` tests total)
- `npm run build` passed

## 5) Remaining dependencies (not blockers for phase closure)
- Open DOCX ambiguities remain tracked in:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/docs/calculator_spec_open_questions.md`
- Zone 6 Offer Summary can now consume Zone 5 totals and Zone 4 contract summary data.
