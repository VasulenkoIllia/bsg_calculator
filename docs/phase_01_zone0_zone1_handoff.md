# Phase 01 Handoff: Zone 0 + Zone 1

Date: 2026-04-22  
Status: Completed

## 1) Completed zone/module
- Zone 0: `Calculator Type` (Payin/Payout mode selection with at least one active mode)
- Zone 1A: `Payin Traffic Input`
- Zone 1B: `Payout Traffic Input`
- Derived metrics for Payin/Payout in current phase scope
- Zone-level compact mode (`Collapse/Expand`) for all current blocks

## 2) Files changed
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/index.css`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/main.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.test.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/test/setup.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone0/calculatorType.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone0/calculatorType.test.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone1/traffic.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone1/traffic.test.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/shared/math.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/shared/math.test.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/shared/format.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/vite.config.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/package.json`
- `/Users/monstermac/WebstormProjects/bsg_calculator/postcss.config.cjs`
- `/Users/monstermac/WebstormProjects/bsg_calculator/tailwind.config.cjs`

## 3) DOCX rules covered in this phase
Source: `Calculator_Описание.docx`

- Zone 0 selection behavior:
  - Payin/Payout checkboxes
  - one or both allowed
  - at least one always enabled
- Zone 1 traffic inputs:
  - Payin: monthly volume, successful transactions, approval ratio, EU/WW split, CC/APM split
  - Payout: monthly volume, total payout transactions
- Core derived calculations used by Zone 1:
  - average transaction
  - attempts and failed transactions from approval ratio
  - regional and payment-method volume split
  - split formulas with substituted values shown directly under split inputs
  - derived metrics formula traces with substituted values shown in dedicated `Calculation Details` blocks
- Formatting:
  - UI number format `1,234,567.89`
- UX:
  - clear Payin/Payout separation
  - per-zone collapse/expand compact mode

## 4) Tests added/passed
- Unit tests:
  - `zone0/calculatorType.test.ts`
  - `zone1/traffic.test.ts`
  - `shared/math.test.ts`
- UI tests:
  - `App.test.tsx`:
    - readonly auto average in input blocks
    - formatted number input with commas/decimal point
    - split formula rendering and dynamic recalculation
    - derived metrics formula trace rendering
    - collapse/expand behavior

Gate results:
- `npm run typecheck` passed
- `npm run test` passed
- `npm run build` passed

## 5) Blockers / open items
- No blockers for Phase 01 scope.
- Global unresolved spec ambiguities remain tracked in:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/docs/calculator_spec_open_questions.md`
