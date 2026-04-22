# Phase 05 Handoff: Zone 5 (Profitability Calculations)

Date: 2026-04-22  
Status: Completed (phase scope)

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
