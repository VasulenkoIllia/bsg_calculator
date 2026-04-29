# Calculator Spec Open Questions

Date: 2026-04-22
Source of truth for this list: `Calculator_Описание.docx`
Status: Closed (product decisions provided, implementation alignment in progress)

## Working rule
We continue implementation of non-ambiguous modules.
We return to an open question only when it blocks the current module or test case.

## Resolved questions

1. Settlement Fee composition (resolved 2026-04-22)
- Resolution from product owner:
  - `Payin Fees (ALL) = MDR + (if TRX enabled) TRX Rev + (if 3DS enabled) 3DS Rev`
  - `Payout Fees (ALL) = MDR + (if TRX enabled) TRX Rev + (if 3DS enabled) 3DS Rev`
- Applies to formula:
  - `Net = (Payin Vol + Payout Vol) - (Payin Fees + Payout Fees)`
- Note:
  - This item is no longer open and should be used as canonical rule in Zone 4/5 implementation.

2. Provider TRX APM rate (resolved 2026-04-22)
- Resolution from product owner:
  - Canonical payin provider TRX rates:
    - `CC = €0.22`
    - `APM = €0.27`
- Note:
  - The `€0.22`/`€0.27` conflict is closed.
  - `APM = €0.27` is fixed as canonical.

3. 3DS fee UX rule (resolved 2026-04-22, updated same day)
- Resolution from product owner:
  - `3DS Revenue per Successful TRX (€)` is editable (unlocked), with 2 decimal precision.
- Note:
  - Previous locked interpretation was superseded by updated product decision.

4. Introducer commission base (resolved 2026-04-22)
- Resolution from product owner:
  - Payin and Payout are treated as separate calculators.
  - Introducer commission applies to Payin only.
  - Zone 2 `Commission Base Volume` must use only Payin monthly volume (no Payin+Payout sum).

5. Scheme Fees in IC++ (resolved 2026-04-22)
- Resolution from product owner:
  - In IC++, Scheme Fees do not affect profitability calculation.
  - Scheme/Interchange costs are applied only for Blended model.
  - Scheme Fees and Interchange are hidden from Zone 3 inputs.
  - Interchange is a fixed hidden cost for Zone 5 profitability only, with defaults EU `0.75%` and WW `2%`.

6. Provider 3DS cost base (resolved 2026-04-22)
- Resolution from product owner:
  - Provider 3DS cost is calculated from `Total Attempts`.

7. 3DS revenue field behavior (updated 2026-04-22)
- Resolution from product owner:
  - `3DS Revenue per Successful TRX (€)` is editable (unlocked), with 2 decimal precision.

8. Payout minimum fee visibility (resolved 2026-04-22)
- Resolution from product owner:
  - Minimum fee logic must be explicitly visible in formulas/metrics.
  - Calculator must clearly show when minimum fee is applied and use adjusted value in totals.

9. Zone 2 custom tier notation (resolved 2026-04-22)
- Clarification from DOCX:
  - Core formula is `Volume in millions × Rate per €1M`.
  - Percent examples are equivalent representation of the same rate.
  - Implementation may keep `per €1M` inputs and optionally show equivalent `%`.

## Open questions
- None at the moment.

## Deferred policy
- If new conflicts appear in DOCX, add them here with impacted formulas and blocking point.

## Integration dependencies (tracked)
- Zone 2 `Rev Share`:
  - `Total Revenue (€)` and `Total Costs (€)` are sourced automatically from Zone 5 Payin totals only.
- Zone 2 `Commission Base Volume (€) - Auto`:
  - Source is Payin monthly volume only.
- Zone 3 -> Zone 5:
  - Zone 3 pricing state feeds Zone 5 profitability totals.
  - Scheme/Interchange are applied only for Blended model.
  - Interchange is not editable in Zone 3; it is carried as a hidden fixed default into Zone 5.
- Zone 4/5 -> Zone 6:
  - Offer Summary text now consumes current values from Zones 0-5 and updates dynamically.
  - PDF export currently uses print dialog ("Save as PDF") without a dedicated PDF renderer.
