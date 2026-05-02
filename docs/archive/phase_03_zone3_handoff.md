# Phase 03 Handoff: Zone 3 (Pricing Configuration)

Date: 2026-04-22  
Status: Completed (phase scope)

Update: 2026-05-01
- Zone 3 formula visibility is now controlled by the global top button
  `Show constants & formulas` / `Hide constants & formulas`.
- Zone-level formula toggle in Zone 3 UI is removed.
- Zone 3 formula breakdown cards (`EU/WW/Payout`) are hidden/shown by the global toggle.

## 1) Completed zone/module
- Zone 3: `Pricing Configuration`
- Covered sections:
  - General settings (`Settlement Included`)
  - Payin pricing: EU + WW
  - Payin models: `IC++` / `Blended`
  - Rate modes: `Single Rate` / `Tiered Rates`
  - Payin editable fields: MDR, TRX CC, TRX APM, tier boundaries/rates
  - Hidden Blended-only cost defaults: Scheme Fees
  - Payout pricing: `Single Rate` / `Tiered Rates`
  - Payout fields: MDR, TRX, tier boundaries/rates
  - Validation warnings per DOCX thresholds
  - Formula breakdown with substituted values for all Zone 3 preview calculations
  - Formula visibility in Zone 3 is controlled by the global top button
  - Zone-level collapse/expand support

## 2) Files changed
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/App.test.tsx`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/index.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone3/pricingConfiguration.ts`
- `/Users/monstermac/WebstormProjects/bsg_calculator/src/domain/calculator/zone3/pricingConfiguration.test.ts`

## 3) DOCX rules covered in this phase
Source: `Calculator_Описание.docx`, section `ZONE 3: PRICING CONFIGURATION`.

- Visibility dependency from Zone 0 is respected:
  - Payin pricing shown only when Payin mode is enabled.
  - Payout pricing shown only when Payout mode is enabled.
- `Settlement Included` behavior recorded and surfaced in Zone 3.
- Payin pricing defaults and tier defaults implemented for EU/WW.
- Payout pricing defaults and tier defaults implemented.
- MDR/TRX preview calculations shown with explicit formulas and numeric substitutions.
- `IC++` vs `Blended` now feeds downstream cost handling:
  - `IC++`: Scheme Fees have `0` cost impact.
  - `Blended`: Scheme Fees are carried as hidden costs for Zone 5 profitability.
- Interchange is not editable or displayed in Zone 3 and is not used in Zone 5 payin cost formulas.
- Warnings implemented:
  - Payin MDR low-rate warning (`< 2.5%`).
  - Payout MDR min/max warning (`< 1.3%`, `> 5%`).
  - Payout TRX warning (`< €0.40`) and minimum warning (`< €0.20`).
- Payout minimum floors now apply directly in Zone 3 calculations:
  - configured values are preserved in inputs;
  - applied values are used in revenue formulas when below floor;
  - UI explicitly shows `configured -> applied` per rate/tier.

## 4) Tests added/passed
- Unit tests:
  - `zone3/pricingConfiguration.test.ts`
    - payin single preview
    - payin tiered progressive preview
    - payout single preview
    - payout tiered progressive preview
    - warning rules
- UI tests:
  - `App.test.tsx`
    - Zone 3 rendering and formula breakdown checks
    - tiered mode interaction checks
    - collapse/expand behavior check for Zone 3

Gate results:
- `npm run typecheck` passed
- `npm run test` passed (`28` tests total)
- `npm run build` passed

## 5) Remaining dependencies (not blockers for phase closure)
- Zone 3 values feed Zone 5 final profitability math.  
  Current phase provides deterministic preview math in Zone 3 and stores full pricing state.
- `Settlement Included` toggle affects Zone 4 settlement section visibility and later Zone 5/6 totals.
- Existing open ambiguities for Zone 4/5 remain tracked in:
  - `/Users/monstermac/WebstormProjects/bsg_calculator/docs/calculator_spec_open_questions.md`
