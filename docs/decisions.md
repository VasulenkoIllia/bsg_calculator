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

### Decision: Zone 3 Payin Defaults and Scheme / Interchange Visibility
- Date: 2026-04-28
- Context:
  - Product requested a Zone 3 defaults update.
  - The request states: `Payin pricing EU дефолт - blended`.
  - The same request also mentions Europe and WW together for TRX Fee Enabled, Rate Type, tier boundaries, MDR, and fees.
  - Scheme handling was clarified separately: remove `Scheme Fees` from Zone 3 UI.
  - Interchange handling was later clarified: remove `Interchange (%)` from Zone 3 UI and keep it as a fixed hidden Zone 5 cost only for `Blended`.
- Ambiguity recorded:
  - We had two possible readings for the payin model default: apply `Blended` only to Payin EU, or apply it to both Payin EU and Payin WW because other defaults were described for Europe and WW together.
- Alternatives considered:
  - Apply `Blended` by default to Payin EU only, leaving Payin WW on its current/default model.
  - Apply `Blended` by default to both Payin EU and Payin WW for consistency with the other EU/WW Zone 3 default changes.
- Decision:
  - Use the literal scope from the request: Payin EU defaults to `Blended`; Payin WW remains on its existing/default `IC++` model.
  - Apply the shared EU/WW defaults to TRX Fee Enabled, Rate Type, and tier boundaries.
  - Remove `Scheme Fees` and `Interchange (%)` from Zone 3 UI and formula breakdowns.
  - Keep Scheme as an internal calculation cost with defaults EU `0.75%` and WW `2%`.
  - Keep Interchange as an internal fixed calculation cost with defaults EU `0.75%` and WW `2%`.
  - Keep Scheme Fees visible in Zone 6 Offer Summary for now; this is not part of the Zone 3 removal scope.
  - Hide Interchange from Zone 6 Offer Summary.
- Consequences:
  - Prevents an accidental pricing model change for WW.
  - Future Zone 3 edits should not re-add Scheme or Interchange controls unless product explicitly asks for them to be editable in that zone.
  - Calculation sections may still mention Scheme and Interchange as Blended-only costs; the removal scope is the Zone 3 configuration UI.
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

### Decision: Zone 4 Payin Minimum Fee Contract Summary Does Not Replace Calculation
- Date: 2026-04-28
- Context:
  - Product clarified that the new `Contract Summary Only` block is informational.
  - It describes `Payin Minimum Fee` for contract generation.
  - This clarification should not remove or change the pre-existing revenue-affecting payout minimum fee calculation.
  - Product requested an optional regional split using the project-standard regions `EU` and `WW`.
- Decision:
  - Keep the existing revenue-affecting `Payout Minimum Fee (Per Transaction)` business logic unchanged.
  - Add separate `Contract Summary Only` fields for `Payin Minimum Fee` contract wording.
  - Keep legacy internal field names as `payoutMinimumFee*`; only the user-facing contract-summary wording is renamed.
  - Support two informational contract modes:
    - `overall`
    - `by region (EU / WW)`
  - Default contract wording uses threshold `€2.5M`, fee `€1.00`, and `N/A` above threshold.
  - Keep `Refund Cost = €15` and `Dispute/Chargeback Cost = €75` defaults.
  - Add UI reminders and lower clamps for provider minimums:
    - Refund minimum `€10`
    - Dispute/Chargeback minimum `€50`
  - Settlement Period options are `T+1` through `T+5`.
- Alternatives considered:
  - Treat the new contract-summary wording as a replacement for the existing calculation.
  - Add EU/WW contract split into profitability calculations immediately.
- Consequences:
  - Zone 5 payout revenue can still include the old payout minimum uplift when the existing revenue-affecting checkbox is enabled.
  - The new overall/EU/WW contract fields do not affect Zone 5 by themselves.
  - Future contract generation can consume the stored overall/EU/WW values without changing existing profitability formulas.

### Decision: Payin Minimum Fee Contract Block Visibility
- Date: 2026-04-29
- Context:
  - The contract-summary block is labeled `Payin Minimum Fee`.
  - It was previously rendered only when `Payout` mode was active, which created UI ambiguity.
- Decision:
  - Render the `Payin Minimum Fee` contract-summary block when `Payin` mode is active.
  - Keep internal field names (`payoutMinimumFee*`) unchanged for compatibility.
- Consequences:
  - Zone 4 UI and Zone 6 summary now align with the `Payin` naming of this block.
  - No profitability formulas changed; this is a visibility-gating fix only.

### Decision: Settlement Fee Sign and Net Formula Correction
- Date: 2026-04-29
- Context:
  - Product requested a correction to settlement-fee math.
  - Previous implementation used `Payin + Payout` in settlement net and treated settlement fee as a positive addend in `Other Revenue`.
- Decision:
  - Correct settlement net to:
    - `Settlement Net = (Total Payin Volume - Total Payout Volume) - (Total Payin Fees + Total Payout Fees)`.
  - Keep `Settlement Fee = Chargeable Net × Rate`.
  - Apply settlement fee as a deduction in profitability (`Other Revenue` uses `- Settlement Fee`).
- Consequences:
  - Zone 4 settlement base/fee values are lower when payout volume is non-zero.
  - Zone 5 total margin decreases by settlement fee amount (instead of increasing).
  - All formula traces and docs must show `- Settlement Fee` where relevant.

### Decision: Zone 5 Payin Cost Breakdown Presentation
- Date: 2026-04-28
- Context:
  - Product noted that `Provider TRX` was included in payin costs but was not visible in the detailed Zone 5 breakdown.
  - Product also asked to verify why `Interchange` appeared in the cost breakdown and to keep these items in the Payin section.
  - Existing domain methodology already treats `Scheme Fees` and `Interchange` as costs only for `Blended`; for `IC++` they have zero cost impact.
- Decision:
  - Do not change Zone 5 business formulas.
  - Display `Total Payin Costs` as `EU Costs + WW Costs`.
  - Expand each `Blended` regional payin cost row into provider MDR tiers, provider TRX CC/APM, Scheme Fees, and Interchange.
  - For `IC++`, do not show Scheme Fees or Interchange rows and keep their cost impact at `€0`.
- Alternatives considered:
  - Keep top-level total as `Provider MDR + Provider TRX + Scheme + Interchange`.
  - Remove Interchange from the breakdown entirely.
- Consequences:
  - The visible breakdown now matches the regional cost structure used by the calculation engine.
  - Provider TRX is auditable in Zone 5 without changing profitability.
  - Interchange remains visible only where it belongs: inside final Zone 5 Payin regional costs for `Blended`.

### Decision: Zone 3/4 Formula Visibility Toggles
- Date: 2026-04-29
- Context:
  - Zone 3 and Zone 4 contain long formula breakdowns that are useful for audit but can make the working UI noisy.
- Decision:
  - Add zone-level `Show formulas` / `Hide formulas` toggles for Zone 3 and Zone 4.
  - Hide only formula text rows when toggled off.
  - Keep metrics, inputs, warnings, and all calculations active.
  - Defaults and reset restore formulas to visible.
- Consequences:
  - Users can keep the calculation cards compact without losing business outputs.
  - The formula visibility state has no effect on profitability or offer-summary calculations.

### Decision: Zone 5 3DS Display Placement
- Date: 2026-04-29
- Context:
  - 3DS revenue and 3DS costs were calculated correctly but displayed as standalone rows under `Other Revenue`.
  - Product requested the Profitability view to show those values in the corresponding Payin block with EU/WW split.
- Decision:
  - Keep all 3DS calculations unchanged.
  - Display 3DS revenue and costs under `Payin Revenue & Costs`.
  - In unified hierarchy, place `3DS Revenue (EU/WW)` under `Total Payin Revenue`.
  - In unified hierarchy, place `3DS Costs (EU/WW)` under `Total Payin Costs`.
  - Split Payin 3DS display into EU and WW using existing Payin successful transactions and Payin attempts.
  - Remove the separate `Payin Net Margin` child row in unified Payin block and keep the same net-margin formula on parent `Payin Revenue & Costs`.
  - Remove separate 3DS Revenue and 3DS Costs child rows from `Other Revenue`.
  - Keep `Other Revenue` total unchanged and show Payin 3DS Net in its formula.
- Consequences:
  - Profitability presentation now follows the Payin/Payout grouping without changing totals.
  - Unified tree hierarchy is cleaner and avoids duplicate values for Payin net margin.
  - No Payout 3DS rows are added because the current 3DS rule is Payin-based.

### Decision: Constraint Helper Warning Style
- Date: 2026-04-29
- Context:
  - Several calculator fields clamp or normalize user input to a minimum, maximum, rounding rule, or
    calculation floor.
  - Product requested visible yellow/orange notes so users understand why an entered value may reset
    to another value.
- Decision:
  - Keep all calculation and clamp rules unchanged.
  - Add a shared amber warning style to `NumberField` helper text for explicit minimum/floor/rounding
    notes.
  - When a constrained numeric field receives an out-of-range value and has no explicit warning helper,
    show an amber helper explaining the applied minimum or maximum.
- Consequences:
  - The UI explains clamped values consistently across zones without changing business logic.
  - Existing informational helper text keeps the default muted style unless it describes a constraint,
    floor, or normalization rule.

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
