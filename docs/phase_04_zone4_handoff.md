# Phase 04 Handoff: Zone 4 (Other Fees & Limits)

Date: 2026-04-22  
Status: Completed (phase scope)

## 1) Completed zone/module
- Zone 4: `Other Fees & Limits`
- Covered sections:
  - `Payout Minimum Fee (Per Transaction)` with round-up-to-€0.10 normalization.
  - `3DS Fee` with locked revenue (`€0.05`) and always-applied provider cost (`€0.03`).
  - `Settlement Fee` visibility dependency from Zone 3 (`Settlement Included`).
  - `Monthly Minimum Fee` uplift logic.
  - `Failed TRX Charging` modes:
    - `Over Limit Only` (informational)
    - `All Failed Volume` (affects profitability).
  - `Contract Summary Only` fields (non-profitability, Zone 6-targeted).
  - Formula breakdown lines with substituted values.
  - Zone-level collapse/expand support.

## 2) Files changed
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.test.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/index.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone4/otherFeesAndLimits.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone4/otherFeesAndLimits.test.ts`

## 3) DOCX rules covered in this phase
Source: `Calculator_Описание.docx`, section `ZONE 4: OTHER FEES & TRANSACTION LIMITS`.

- Revenue-affecting options implemented and tied to dynamic recalculation.
- Settlement formula implemented:
  - `Net = (Payin Vol + Payout Vol) - (Payin Fees (ALL) + Payout Fees (ALL))`
  - `Settlement Fee = Net × Rate%`
  - `Client Net = Net - Settlement Fee`
- Monthly minimum warning and payout minimum warning behavior implemented.
- Failed TRX modes aligned with DOCX behavior split.
- Contract fields exposed without affecting profitability.

## 4) Tests added/passed
- Unit tests:
  - `zone4/otherFeesAndLimits.test.ts`
- UI tests:
  - `App.test.tsx` Zone 4 interaction checks

Gate results:
- `npm run typecheck` passed
- `npm run test` passed
- `npm run build` passed

## 5) Remaining dependencies (not blockers for phase closure)
- Zone 4 outputs feed Zone 5 profitability cards and totals.
- Ambiguous DOCX items remain tracked in:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/docs/calculator_spec_open_questions.md`
