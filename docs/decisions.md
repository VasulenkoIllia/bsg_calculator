# Decisions

Use this file to record meaningful technical decisions for the project.

## Record when
- choosing architecture direction
- changing deployment strategy
- introducing or removing dependencies
- changing database approach
- changing integration flow
- adding important operational rules

## Suggested template
### Decision: <title>
- Date:
- Context:
- Decision:
- Alternatives considered:
- Consequences:
- Follow-up actions:

### Decision: Calculator Spec Open-Questions Register
- Date: 2026-04-22
- Context:
  - We continue implementation in phases and do not want to stop progress on ambiguous requirements.
  - Current working source for ambiguity tracking is `Calculator_Описание.docx`.
- Decision:
  - Track disputed/unclear calculator rules in a dedicated document:
    - `docs/calculator_spec_open_questions.md`
  - Treat those items as deferred and return to each one only when it blocks a specific module or test case.
- Alternatives considered:
  - Blocking implementation until all spec ambiguities are answered.
  - Encoding assumptions globally before module-level need.
- Consequences:
  - Development can proceed on non-ambiguous modules without churn.
  - Ambiguities remain visible and explicitly scoped to blocking points.
- Follow-up actions:
  - Resolve open items progressively during implementation, starting from the first blocking module.

### Decision: Zone 3 Payin Defaults and Scheme Visibility
- Date: 2026-04-28
- Context:
  - Product requested a Zone 3 defaults update.
  - The request states: `Payin pricing EU дефолт - blended`.
  - The same request also mentions Europe and WW together for TRX Fee Enabled, Rate Type, tier boundaries, MDR, and fees.
  - Scheme handling was clarified separately: remove only `Scheme Fees` from Zone 3 UI; keep `Interchange (%)` in Zone 3.
- Ambiguity recorded:
  - We had two possible readings for the payin model default: apply `Blended` only to Payin EU, or apply it to both Payin EU and Payin WW because other defaults were described for Europe and WW together.
- Alternatives considered:
  - Apply `Blended` by default to Payin EU only, leaving Payin WW on its current/default model.
  - Apply `Blended` by default to both Payin EU and Payin WW for consistency with the other EU/WW Zone 3 default changes.
- Decision:
  - Use the literal scope from the request: Payin EU defaults to `Blended`; Payin WW remains on its existing/default `IC++` model.
  - Apply the shared EU/WW defaults to TRX Fee Enabled, Rate Type, and tier boundaries.
  - Remove only `Scheme Fees` from Zone 3 UI and formula breakdowns.
  - Keep `Interchange (%)` visible in Zone 3.
  - Keep Scheme as an internal calculation cost with defaults EU `0.75%` and WW `2%`.
  - Keep Scheme Fees visible in Zone 6 Offer Summary for now; this is not part of the Zone 3 removal scope.
- Consequences:
  - Prevents an accidental pricing model change for WW.
  - Future Zone 3 edits should not re-add Scheme controls unless product explicitly asks for Scheme to be editable in that zone.
  - Calculation sections may still mention Scheme as a cost; the removal scope is the Zone 3 configuration UI.
  - Offer Summary can be adjusted separately later if product decides Scheme should be hidden from client-facing output too.

### Decision: Zone 2 Agent / Introducer Toggle
- Date: 2026-04-28
- Context:
  - Product clarified that `Agent` means `Introducer`.
  - Zone 2 should support calculations with or without an agent/introducer.
  - Default state should be no agent.
- Decision:
  - Add `Agent / Introducer` as a Zone 2 checkbox.
  - Default checkbox state is `off`; `Apply defaults` restores it to `off`.
  - Keep default commission model as `Standard`.
  - When the checkbox is off, introducer commission is not applied to total profitability or Offer Summary.
  - Custom model defaults are `5M / 10M` tiers and `0.75% / 0.5% / 0.25%` rates.
  - Rev Share default remains `25%`.
- Consequences:
  - Users can prepare Zone 2 model settings without applying an introducer to the final calculation.
  - Total profitability now has an explicit disabled-introducer path instead of relying on zero rates.
  - Offer Summary clearly shows when no agent/introducer is applied.

### Decision: Phase Sequencing (Zone 2 Next)
- Date: 2026-04-22
- Context:
  - Zone 0/1 scope is completed and verified by typecheck/test/build gates.
  - DOCX section order defines `Zone 2: Introducer Commission` as the next module.
- Decision:
  - Lock Phase 01 handoff in documentation and start Phase 02 with Zone 2 implementation.
  - Keep phased delivery discipline and do not move to Zone 3 until Zone 2 gate passes.
- Alternatives considered:
  - Jump directly to Zone 3 pricing configuration.
  - Continue UI refinements only without starting the next formula module.
- Consequences:
  - Cleaner incremental validation and less regression risk.
  - Introducer commission logic becomes testable before integration into full profitability totals.
- Follow-up actions:
  - Implement `zone2/introducerCommission` domain module.
  - Add Zone 2 UI section and tests.

### Decision: Settlement Fee Composition Rule
- Date: 2026-04-22
- Context:
  - Settlement net formula requires explicit definition of `Payin Fees (ALL)` and `Payout Fees (ALL)`.
  - This was tracked as an open ambiguity in `docs/calculator_spec_open_questions.md`.
- Decision:
  - Use canonical composition provided by product owner:
    - `Payin Fees (ALL) = MDR + (if TRX enabled) TRX Rev + (if 3DS enabled) 3DS Rev`
    - `Payout Fees (ALL) = MDR + (if TRX enabled) TRX Rev + (if 3DS enabled) 3DS Rev`
- Alternatives considered:
  - Keep this item open until Zone 4/5 implementation.
  - Infer composition only from DOCX examples.
- Consequences:
  - Settlement fee integration can proceed without re-open discussion on this point.
  - Zone 4/5 tests must assert this exact composition.
- Follow-up actions:
  - Keep this rule reflected in open-questions doc as resolved.
  - Apply this rule in upcoming Zone 4/5 implementation.

### Decision: Phase Sequencing (Zone 4 Next)
- Date: 2026-04-22
- Context:
  - Zone 3 pricing configuration is implemented with domain module, UI, formula traces, and green gates.
  - Remaining integration-critical behavior for settlement and other fees starts in Zone 4.
- Decision:
  - Freeze Zone 3 for this phase and move next to `Zone 4: Other Fees & Limits`.
- Alternatives considered:
  - Start Zone 5 profitability totals before implementing Zone 4 controls.
  - Keep iterating Zone 3 visual changes without opening next formula block.
- Consequences:
  - Clear dependency chain is preserved (`Zone 4 inputs` -> `Zone 5 totals`).
  - Open ambiguities stay centralized in `docs/calculator_spec_open_questions.md`.
- Follow-up actions:
  - Implement Zone 4 controls and domain formulas with tests.
  - Wire `Settlement Included` behavior from Zone 3 into Zone 4 visibility.

### Decision: Phase Sequencing (Zone 6 Next)
- Date: 2026-04-22
- Context:
  - Zone 5 profitability totals are complete and verified.
  - DOCX order defines `Zone 6: Offer Summary` as the next module.
- Decision:
  - Start and complete Zone 6 as the next phase, consuming data from Zones 0-5.
- Alternatives considered:
  - Delay Zone 6 and continue only with visual cleanup.
  - Implement non-DOCX features before offer export.
- Consequences:
  - End-to-end calculator flow now includes proposal output stage.
  - Existing phase-gate discipline remains intact.
- Follow-up actions:
  - Add summary generation module and tests.
  - Add UI export controls and collapse/expand support.

### Decision: Zone 6 Export Path (No PDF Dependency in Phase 06)
- Date: 2026-04-22
- Context:
  - DOCX requires `Copy to Clipboard`, `Export to PDF`, and `Print`.
  - Current frontend stack has no dedicated PDF rendering dependency.
- Decision:
  - Implement:
    - clipboard copy via browser API,
    - print/export via browser print dialog (with Save-as-PDF path),
    - preview text area for manual copy fallback.
- Alternatives considered:
  - Add a PDF library immediately (larger bundle/maintenance impact).
  - Ship only copy without print/export support.
- Consequences:
  - Required actions are available without adding third-party dependencies.
  - True binary-PDF generation can be introduced later if product requires a stricter export format.
- Follow-up actions:
  - Reassess dedicated PDF rendering only if contract workflow requires fixed branded PDF output.

### Decision: Resolve Provider TRX APM Rate and 3DS UX Rule
- Date: 2026-04-22
- Status: superseded later the same day for 3DS UX (see next decision block)
- Context:
  - Two DOCX ambiguities remained open and were blocking final UI clarity:
    - Provider TRX APM rate conflict (`0.22` vs `0.27`),
    - 3DS UX conflict (locked fixed fee vs selectable dropdown).
- Decision:
  - Fix provider TRX rates as:
    - `CC = €0.22`
    - `APM = €0.27`
  - Temporary 3DS revenue UX assumption at that time:
    - `€0.05` fixed and locked (non-editable).
- Alternatives considered:
  - Keep both items open and continue highlighting as unresolved.
  - Implement configurable mode for 3DS UX while waiting for final clarification.
- Consequences:
  - Red blocker notices for these two items are removed from active UI paths.
  - Open-questions register now excludes these two items.
- Follow-up actions:
  - Keep unresolved red notices only for remaining items:
    - Scheme Fees behavior in IC++,
    - Provider 3DS cost base,
    - Introducer commission base volume source.
  - Update 3DS UX to editable model once final product clarification is received.

### Decision: Finalize Remaining DOCX Ambiguities for Zone 2/3/4/5
- Date: 2026-04-22
- Context:
  - Remaining open questions were blocking final consistency checks and UI cleanup.
- Decision:
  - `Introducer Commission` applies to Payin only.
  - Zone 2 `Commission Base Volume` = Payin monthly volume only.
  - In IC++, `Scheme Fees` and `Interchange` do not affect calculations (Blended-only costs).
  - `Provider 3DS Cost` is calculated on `Total Attempts`.
  - `3DS Revenue per Successful TRX` is editable with 2 decimal precision.
  - Minimum fee behavior must be explicitly displayed with applied values in formulas.
- Alternatives considered:
  - Keep unresolved red blockers in UI until a later phase.
  - Preserve previous assumptions (combined volume, locked 3DS revenue, successful-only 3DS cost).
- Consequences:
  - Red ambiguity notices for these items can be removed from active UI.
  - Zone 2/3/4/5 formulas become deterministic for tests and handoff.
- Follow-up actions:
  - Keep documentation synchronized with any future product clarifications.

### Decision: Frontend-Only Test Deployment via nginx + Traefik
- Date: 2026-04-23
- Context:
  - Current project stage is frontend-only calculator.
  - Previous container runtime started Node health server and did not serve built frontend UI.
  - Test deployment target is `bsg.workflo.space`.
- Decision:
  - Build SPA with Vite in Docker build stage.
  - Serve built static assets via nginx in runtime stage.
  - Add `/health` endpoint in nginx config for compose healthcheck.
  - Keep Traefik host routing via `APP_DOMAIN` and set target domain to `bsg.workflo.space`.
- Alternatives considered:
  - Keep Node runtime and add static serving in `server/`.
  - Run Vite preview in production container.
- Consequences:
  - Container now serves actual frontend app in production-like way.
  - Healthcheck becomes independent from Node runtime.
  - Backend can still be reintroduced later without blocking frontend tests.
- Follow-up actions:
  - If backend is added, decide between single-container SSR/API serving or split frontend/backend services.
