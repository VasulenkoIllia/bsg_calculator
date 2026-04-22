# Calculator Delivery Contract

Date: 2026-04-22
Scope: Rebuild calculator as modular React app with deterministic calculation engine.

## 1) Source of Truth
- Primary requirements source: `Calculator_Описание.docx`.
- If a rule is ambiguous/conflicting, it must be listed in:
  - `docs/calculator_spec_open_questions.md`
- Do not silently invent business rules for ambiguous parts.

## 2) Delivery Policy (No Partial Zone Handoffs)
- Work by zones and modules, but each delivered zone must be internally complete.
- "Complete" means:
  - all zone fields present,
  - all zone interactions implemented,
  - all zone formulas wired,
  - tests added for that zone,
  - UI readable when both Payin and Payout are enabled.

## 3) Mandatory UX Rules
- Payin and Payout inputs must be visually separated when both are enabled.
- No mixed "all in one pile" forms.
- Every derived block must be tied to its zone (`Derived: Payin`, `Derived: Payout`, etc.).
- Every zone must support per-zone `Collapse/Expand` (compact mode), including future zones.
- Recalculation must happen on every input change.
- Number formatting in UI: `1,234,567.89` (en-US).

## 4) Mandatory Engineering Rules
- Keep calculation logic in domain modules, not inside UI components.
- Keep UI state and formula logic separate.
- Every formula module must have unit tests.
- Every example used in DOCX should become a test fixture when that module is implemented.

## 5) Phase Gate (Required Before Next Phase)
Before moving to next module/zone:
1. `npm run typecheck` passes.
2. `npm run test` passes.
3. `npm run build` passes.
4. Delivered zone checklist is complete.
5. Any blocked ambiguity is recorded in `docs/calculator_spec_open_questions.md`.

## 6) Handoff Format Per Phase
Each phase handoff must include:
1. What zone/module was completed.
2. Which files were changed.
3. Which DOCX formulas/rules are now covered.
4. What tests were added and passed.
5. What remains blocked (if anything).
