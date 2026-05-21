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
  - Interchange handling from this decision is superseded by `Zone 5 Payin Cost Formula Corrections (Global MDR + No Interchange)` dated 2026-04-29.
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
- Status: Superseded in sign handling by `Settlement Fee Revenue Sign Clarification` on 2026-04-30.
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

### Decision: Settlement Fee Revenue Sign Clarification
- Date: 2026-04-30
- Context:
  - Product clarified that Settlement Fee is a fee we earn from the client and must be treated as revenue.
  - The settlement-base formula remains unchanged.
- Decision:
  - Keep settlement base/net formula:
    - `Settlement Net = (Total Payin Volume - Total Payout Volume) - (Total Payin Fees + Total Payout Fees)`.
    - `Chargeable Net = max(0, Settlement Net)`.
    - `Settlement Fee = Chargeable Net × Rate`.
  - Treat Settlement Fee as a positive component in `Other Revenue`.
  - Update labels to remove `Deduction` wording.
- Consequences:
  - Zone 5 `Other Revenue` now uses `Settlement Fee + Monthly Minimum Adj`.
  - Unified and Zone 5 formulas show Settlement Fee as positive revenue.

### Decision: Settlement Net Must Use Applied Payout Fees
- Date: 2026-04-30
- Context:
  - Product reported that `Chargeable Net` did not reflect `MIN PAYOUT TRX FEE` trigger.
  - Settlement base used `payoutBaseRevenue` (before minimum uplift), which understated `Payout Fees ALL`.
- Decision:
  - In Settlement Net wiring, use applied payout revenue:
    - `payoutFeesAll = payoutRevenueAdjusted`.
  - Keep formula structure unchanged:
    - `Settlement Net = (Total Payin Volume - Total Payout Volume) - (Total Payin Fees + Total Payout Fees)`.
- Consequences:
  - When payout minimum fee is triggered, `Chargeable Net` and settlement fee are recalculated from uplifted payout fees.
  - UI formula trace now shows `Payout Fees ALL` with the applied payout revenue value.

### Decision: Settlement / Other Revenue Formula Trace Clarity
- Date: 2026-04-30
- Context:
  - Product reported ambiguity when `Chargeable Net` was positive but `Settlement Fee` displayed `€0` (because toggle OFF).
  - Product also requested compact formula output when `Monthly Minimum Adj = €0`.
- Decision:
  - Keep full `Chargeable Net` calculation visible regardless of Settlement toggle.
  - When `Settlement Included` is ON in Zone 3, the unified settlement line must explicitly state this reason for `€0` (instead of attributing `€0` to Settlement toggle state).
  - When Settlement toggle is OFF, show `Settlement Fee = €0` with reference formula (`Chargeable Net × Rate`) as informational.
  - In `Other Revenue` formula line, show:
    - only `Settlement Fee` when `Monthly Minimum Adj = 0`,
    - `Settlement Fee + Monthly Minimum Adj` when uplift is positive.
- Consequences:
  - Formula traces remain mathematically transparent and unambiguous.
  - Users see one-term or two-term `Other Revenue` formula depending on whether monthly uplift is actually applied.

### Decision: Zone 5 Payin Cost Breakdown Presentation
- Date: 2026-04-28
- Status: Superseded in part by `Zone 5 Payin Cost Formula Corrections (Global MDR + No Interchange)` on 2026-04-29.
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

### Decision: Zone 5 Payin Cost Formula Corrections (Global MDR + No Interchange)
- Date: 2026-04-29
- Context:
  - Product validation against Excel showed two critical mismatches in Zone 5 payin costs:
    - `Provider MDR` was calculated per region (`EU` and `WW` separately), while expected logic is tiering on total payin volume.
    - `Interchange` appeared as an additional cost line, duplicating cost impact that should not be charged.
  - Example mismatch case: total payin `€25.1M`, split `EU 80% / WW 20%`.
- Decision:
  - Apply provider MDR tiers on total payin volume first (`EU + WW`), then allocate tier rows and costs back to `EU/WW` by volume share.
  - Remove `Interchange` from payin cost formulas and from Zone 5 payin cost breakdown rows.
  - Keep `Scheme Fees` as Blended-only cost.
  - Keep `Interchange` field in internal config shape for backward compatibility only; set calculation impact to `€0`.
- Consequences:
  - For the `€25.1M` / `80/20` case, total provider MDR becomes `€396,400` (instead of `€406,540` with per-region tiering).
  - Zone 5 formulas and UI rows now match product Excel expectations.
  - Historical entries mentioning Interchange as an active payin cost are superseded by this correction.

### Decision: Zone 3/4 Formula Visibility Toggles
- Date: 2026-04-29
- Status: Superseded by `Global constants/formulas toggle and Zone 5 summary cleanup` on 2026-05-01.
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

### Decision: Global constants/formulas toggle and Zone 5 summary cleanup
- Date: 2026-05-01
- Context:
  - Product requested one top-level button for formula visibility behavior and removal of remaining duplicate summary cards.
  - Zone 3/4 still had visible breakdown cards in some states, and Zone 5 still had legacy standalone summary blocks duplicated with unified tree.
- Decision:
  - Keep a single top action button `Show constants & formulas` / `Hide constants & formulas`.
  - This button controls:
    - hardcoded constants block visibility,
    - Zone 2 formula breakdown panel visibility,
    - Zone 3 formula rows and Zone 3 formula breakdown cards,
    - Zone 4 formula rows and Zone 4 formula breakdown card.
  - Zone 5 retains independent formula visibility control via local `Show Formulas` checkbox.
  - Remove legacy Zone 5 standalone summary blocks:
    - `TOTAL PROFITABILITY` card grid,
    - `Payin Revenue & Costs` card grid,
    - `Other Revenue` summary card,
    - `Introducer Commission` summary card,
    - `Payout Revenue & Costs` summary card.
  - Keep only unified profitability tree as the canonical profitability display.
- Consequences:
  - UI is cleaner and avoids duplicate numbers.
  - Formula visibility behavior is consistent for zones 2/3/4 from one entrypoint, while Zone 5 keeps local control by design.
  - Business formulas and totals are unchanged (presentation-only change).

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
  - Include 3DS Revenue in `Total Payin Revenue` and 3DS Costs in `Total Payin Costs`.
  - `Other Revenue` contains only Settlement Fee and Monthly Minimum Adjustment (no Payin 3DS Net).
- Consequences:
  - Profitability presentation now follows the Payin/Payout grouping without changing totals.
  - Unified tree hierarchy is cleaner and avoids duplicate values for Payin net margin.
- No Payout 3DS rows are added because the current 3DS rule is Payin-based.

### Decision: Architecture Cleanup Pass (No Formula Changes)
- Date: 2026-05-01
- Context:
  - Product requested full cleanup/decomposition while preserving current business behavior and visuals.
  - Core checks were already green, but technical debt remained in test organization and dead UI plumbing.
- Decision:
  - Keep all calculation/business formulas unchanged.
  - Remove dead ambiguity flags/components that were no longer active in runtime.
  - Split monolithic app integration test suite into focused files by area/zone.
  - Add CI verification workflow and a local `npm run verify` command (`typecheck` + `test` + `build`).
  - Keep audit register in `docs/audit_2026-05-01.md` with explicit resolved/open items.
- Consequences:
  - Runtime behavior and rendered business outputs stay the same.
  - Codebase is easier to maintain and review.
  - Remaining large-module decomposition (`useCalculatorDerivedData`, Zone 3/4 internals) is tracked as the next refactor step.

### Decision: Formula Display Precision for Variable Fees
- Date: 2026-04-29
- Context:
  - Formula factors with decimal fees (for example `€2.5`, `€0.22`, `€0.27`) were rendered as integers in
    several Zone 3/4/5 and unified formula rows because integer money formatter was reused for both totals
    and variable coefficients.
  - This created visible contradictions like `attempts × €0 = €59,400`.
- Decision:
  - Keep integer money formatting for final aggregate monetary outputs.
  - Use variable-fee formatting (up to 2 decimals) for fee coefficients in formulas, warnings, and
    contract-preview per-transaction values.
  - Apply the rule consistently to TRX fee factors, 3DS per-attempt/per-successful factors, payout
    minimum per-TRX factors, and configured/applied minimum-floor fee values.
- Consequences:
  - Formula traces are mathematically readable and match configured values.
  - Business calculations and totals remain unchanged; this is a display-precision correction.

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
  - In IC++, `Scheme Fees` do not affect calculations; `Interchange` does not affect calculations for any payin model.
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

### Decision: Decimal Comma Input Normalization and Removal of Derived Metrics UI Blocks
- Date: 2026-04-30
- Context:
  - Users can input decimal values with comma (for example `0,2`) and the previous parsing path could interpret this as `2` in some fields.
  - Product also requested to remove remaining `Derived Metrics` summary/UI sections, including `Calculation Details` blocks.
- Decision:
  - Standardize numeric parsing in shared `NumberField` flow:
    - accept both `,` and `.` as decimal separators,
    - keep thousand-separator support (for example `1,000`),
    - normalize display to project format on blur (`.` as decimal separator).
  - Remove `Derived Metrics: Payin` and `Derived Metrics: Payout` UI sections and their `Calculation Details` blocks.
- Alternatives considered:
  - Replacing comma with dot directly during typing in all cases.
  - Keeping derived sections collapsed instead of removing them.
- Consequences:
  - Decimal inputs like `0,2`, `0,65`, `0,07` are interpreted correctly as `0.2`, `0.65`, `0.07`.
  - Thousand input like `1,000` remains interpreted as one thousand.
  - UI is cleaner; derived formulas are no longer duplicated in separate sections.

### Decision: App.tsx modular refactor without business logic changes
- Date: 2026-05-01
- Context:
  - `src/App.tsx` exceeded 5k lines and mixed state presets, parsing utilities, helper algorithms, and UI primitives in one file.
  - This made maintenance and safe review harder.
- Decision:
  - Keep existing business formulas and behavior unchanged.
  - Move reusable code out of `App.tsx` into `src/components/calculator/*`:
    - UI primitives (`NumberField`, toggles, cards, zone shell, unified row),
    - numeric parsing/formatting helpers,
    - hardcoded constants builder,
    - calculator state presets + cloning helpers,
    - app helper functions (preview fee helpers, tree expansion helpers, zone navigation helper).
  - Finalize decomposition by introducing dedicated hooks:
    - `useCalculatorState` for state + UI actions.
    - `useCalculatorDerivedData` for derived calculations + unified profitability tree construction.
  - Keep `App.tsx` as a thin composition/orchestration layer across Zone 0..Zone 6 components.
- Consequences:
  - `App.tsx` dropped from monolithic size to a significantly smaller orchestration file.
  - Reusable pieces are now isolated and easier to test/change without touching business logic.
  - Profitability and formula behavior remains unchanged; verification must stay green after refactor.

### Decision: P1 Large-File Decomposition (Zone 3, Zone 4, derived/)
- Date: 2026-05-02
- Context:
  - Four files exceeded 750 lines and were flagged as P1 risk in `docs/audit_2026-05-01.md`:
    - `Zone3PricingConfiguration.tsx` (846 lines) — mixed EU/WW/Payout panels
    - `Zone4OtherFeesAndLimits.tsx` (777 lines) — mixed fee toggles and contract summary
    - `buildUnifiedProfitabilityTree.ts` (795 lines) — all payin/payout/other/introducer nodes inline
    - `useCalculatorDerivedData.ts` (814 lines) — pricing previews, fee impacts, and tree construction mixed
  - Phase 2 (PDF + HubSpot) will consume this code; smaller focused modules reduce integration blast radius.
- Decision:
  - Keep all formulas, displayed wording, and UI behavior unchanged.
  - Zone 3: extract shared `PayinRegionPricingPanel` and `PayoutPricingPanel` into `zones/zone3/`.
  - Zone 4: extract `Zone4RevenueAffectingFees` and `ContractSummarySection` into `zones/zone4/`.
  - `useCalculatorDerivedData`: extract pricing preview memos into `derived/usePricingPreviews.ts` and fee impact memos into `derived/useFeeImpacts.ts`.
  - `buildUnifiedProfitabilityTree`: extract payin subtree into `derived/buildPayinSubtree.ts` and payout subtree into `derived/buildPayoutSubtree.ts`; orchestrator calls them and keeps only total/other/introducer node building.
  - `useCalculatorDerivedData`: delegate tree construction to `buildUnifiedProfitabilityTree` and expansion logic to `useUnifiedTreeExpansion`.
- Alternatives considered:
  - Decompose only one file at a time across multiple PRs.
  - Introduce abstraction layers or shared hooks beyond plain extraction.
- Consequences:
  - File sizes after: Zone3 ~180 lines, Zone4 ~169 lines, `buildUnifiedProfitabilityTree` 359 lines, `useCalculatorDerivedData` 541 lines.
  - All new modules are pure or focused single-responsibility units.
  - No business logic or visual changes; verified by 138/138 tests, typecheck, and build passing.

### Decision: Unified Document Pipeline with Immutable Versioning
- Date: 2026-05-02
- Context:
  - Product requires three entry scenarios for PDF creation:
    - from calculator data,
    - from manual step-by-step form,
    - by cloning existing calculator/document as a base.
  - Product also requires strict non-editability of saved calculators/documents and new numbering for each saved new document.
  - UI flow must be block-by-block wizard style and backend/frontend should stay modular.
- Decision:
  - Introduce one canonical payload contract for rendering (`DocumentTemplatePayload`).
  - Force all entry scenarios through one shared pipeline:
    - source adapter -> normalize -> validate -> assign number -> save immutable version -> render PDF.
  - Enforce immutable persistence model:
    - no in-place edits for saved calculator snapshots or saved documents,
    - changes are saved only as new versions/documents with lineage reference to parent.
  - Enforce numbering on every saved new document using transaction-safe allocation.
  - Keep one shared template renderer for all scenarios (no scenario-specific PDF templates).
  - Implement block-based wizard modules matching document sections.
- Alternatives considered:
  - Separate pipelines/templates for each scenario.
  - Allow mutable document edits with version field updates in the same record.
  - Allocate numbers at draft creation time.
- Consequences:
  - Lower divergence risk between scenarios and simpler regression testing.
  - Stronger auditability due to immutable history and lineage links.
  - Clear modular ownership for frontend steps and backend services.
  - Number sequence remains consistent and duplicate-safe under concurrency.
- Follow-up actions:
  - Track implementation tasks in `docs/phase_07_unified_document_pipeline_plan.md`.
  - Enforce visual and structural baseline from `docs/pdf_template_fidelity_requirements.md`.
  - Update integration and API docs when HubSpot sync endpoints are introduced.

### Decision: OFFER PDF Renderer Uses One Mode-Driven Template
- Date: 2026-05-02
- Context:
  - Product requires one global PDF creation logic for all flows (from calculator, manual, clone).
  - Reference PDFs show stable visual skeleton with variable row/column structures by tiers and regional split.
  - Calculator-origin contracts must hide missing values instead of inserting synthetic placeholders.
- Decision:
  - Keep a single OFFER renderer template and drive all structural variants by explicit layout modes.
  - Introduce rendering mode matrix for Payin/Payout (`tiers/regions` combinations) and map calculator data into this matrix automatically.
  - Add optional per-field value modes (`value`, `waived`, `na`, `tbd`) for manual/clone scenarios only.
  - In calculator source mode, omit blocks/rows when values are absent and do not inject `TBD/N/A/Waived`.
  - Track fidelity and sample-based logic in `docs/pdf_rendering_logic_matrix.md`.
- Alternatives considered:
  - Maintain separate template variants per scenario.
  - Keep a single static table layout and fill with placeholder values.
- Consequences:
  - Rendering behavior is deterministic and testable across modes.
  - Future wizard steps can reuse the same template while adding manual controls.
  - Visual updates can be centralized without branch-specific divergence.
- Follow-up actions:
  - Add wizard controls in next phase for explicit manual region/tier/value-mode edits.

### Decision: Introduce PDF UI Kit for OFFER Fidelity
- Date: 2026-05-02
- Context:
  - Product identified visual drift between generated PDF preview and approved sample PDFs.
  - Existing renderer mixed business logic and styling in one file, making precise visual tuning slow.
- Decision:
  - Introduce dedicated PDF UI Kit layer with tokens and reusable primitives.
  - Keep business rendering logic separate from visual primitives.
  - Add standalone UI kit preview page to calibrate colors/typography/sections without changing business data.
- Alternatives considered:
  - Continue patching CSS directly inside renderer.
  - Split by customer-specific templates.
- Consequences:
  - Visual tuning becomes centralized and safer.
  - Changes in palette/typography can be made through token profile first.
  - One template path is preserved for all creation scenarios.
- Follow-up actions:
  - Add theme snapshot tests and compare key token values against approved reference profile.

### Decision: Wizard Uses Full Draft Payload Across Steps 1-6
- Date: 2026-05-02
- Context:
  - Product requested to keep calculator unchanged as source of truth and continue implementation of wizard steps 2-5 in the same block-based flow as step 1.
  - Header-only wizard state was insufficient because edits in Payin/Payout/Fees/Terms could not be confirmed inside wizard before PDF generation.
- Decision:
  - Store wizard state as full `DocumentWizardTemplateData` draft instead of only header fields.
  - Enable and render all wizard steps (1..6) with per-block editable controls.
  - Keep calculator logic untouched; wizard draft is seeded/refilled from current calculator state.
  - Render preview/PDF strictly from wizard draft so user edits in steps 2-5 are included.
- Alternatives considered:
  - Keep step 2-5 read-only and edit only in calculator.
  - Add temporary step-local states and merge only on preview.
- Consequences:
  - Stage-1 integration now supports full calculator -> wizard -> PDF path with explicit per-block confirmation.
  - Data flow is clearer for future manual/clone source modes because one canonical draft shape is already used in UI.

### Decision: Wizard UI Decomposition for Step-Level Maintainability
- Date: 2026-05-02
- Context:
  - `DocumentWizardPanel.tsx` grew to a large monolith after enabling full Step 1-6 editing.
  - Upcoming phases include manual source mode, clone flows, and additional block logic that would further increase complexity.
- Decision:
  - Keep `DocumentWizardPanel` as a thin shell/orchestrator.
  - Move step implementations into dedicated modules under `src/components/document-wizard/wizard/steps`.
  - Move shared wizard helpers (stepper, step navigation, payin layout helpers, nullable-number parser) into `wizard/shared.tsx`.
  - Keep behavior and payload contract unchanged.
- Alternatives considered:
  - Keep single-file implementation until next phase.
  - Introduce larger state-management abstractions before splitting files.
- Consequences:
  - Lower cognitive load per step and easier targeted changes in future phases.
  - Safer regression surface because step logic is isolated by concern.
  - No calculator logic change and no renderer behavior change.

### Decision: Stage 2A Manual Wizard Mode Before Stage 2B Value Modes
- Date: 2026-05-02
- Context:
  - Product confirmed that current priority is complete calculator-parity payload flow and manual wizard start without additional semantic states.
  - Stage 2B field states (`value`, `waived`, `na`, `tbd`) are useful but not required for current milestone.
- Decision:
  - Implement Stage 2A first:
    - allow contract creation flow from manual wizard source,
    - provide two manual seeds (`blank` and `defaults`),
    - keep all fields editable as concrete values only,
    - reuse the same template payload and renderer path as calculator mode.
  - Defer Stage 2B field-state controls to a later iteration.
- Alternatives considered:
  - Implement Stage 2A and Stage 2B together in one pass.
  - Keep manual mode disabled until value modes are implemented.
- Consequences:
  - Faster delivery of calculator-parity wizard behavior.
  - Lower regression risk while stabilizing shared payload mapping.
  - Future Stage 2B will be additive on top of established manual source flow.

### Decision: Calculator Frozen + Documentation Cleanup Pass
- Date: 2026-05-02
- Context:
  - Calculator is product-confirmed as working (math + visual). User explicitly asked that no formula or business-logic change be made without permission.
  - Repository accumulated phase handoff snapshots, a closed open-questions doc, and a backup `.docx` at the root.
  - Two specification documents exist with overlapping but distinct scopes (`Calculator_Описание.docx` covers the calculator only; `technical_specification_bsg.docx v2.0` covers the new PDF/contract generator phase). Lack of an explicit alignment doc was creating scope confusion.
  - HubSpot integration is deferred until after backend foundation is in place.
- Decision:
  - Pin "calculator math is frozen" rule into `README.md` and `AGENTS.md` as a project-specific hard rule.
  - Establish `docs/spec_v2_alignment.md` as the section-by-section status map for the CGS spec.
  - Establish `docs/architecture.md` as the module/data-flow reference.
  - Refresh `docs/integrations.md` to document HubSpot as a planned future integration only (no API calls in code).
  - Move historical phase handoffs (`phase_01..phase_06`), the closed `calculator_spec_open_questions.md`, the predates-Phase-7 `calculator_delivery_contract.md`, and the prior audit (`audit_2026-05-01.md`) to `docs/archive/`.
  - Replace the prior audit with `docs/audit_2026-05-02.md`.
  - Delete root-level `Calculator_Описание_backup_before_red_marks.docx` (stale 58 KB backup).
  - Rename `package.json` `name` from `workflo-fullstack-template` to `bsg-calculator`.
  - Keep `server/` as a skeleton (decision: do not delete; reuse during Phase 8).
- Alternatives considered:
  - Delete `server/` and start fresh in Phase 8. (Rejected per user preference.)
  - Leave audit/historical docs at top level and only mark them stale. (Rejected; archive folder makes "active vs historical" instantly obvious.)
  - Add ESLint as part of this pass. (Deferred — adds devDeps; user wants explicit approval before adding tooling.)
- Consequences:
  - No source code change in this pass; all calculator/wizard/PDF behavior unchanged.
  - Future agents and reviewers can find current scope and constraints in two files instead of inferring from a sprawling `decisions.md`.
  - Backend phase can begin from a clean documentation baseline.
- Follow-up actions:
  - Lock OFFER PDF templates against approved samples (final visual pass).
  - Decide whether to modularize `buildOfferPdfHtml.ts` and `pdf-kit/primitives.ts` before or after AGREEMENT scope is reopened.
  - Open backend phase discussion with user when frontend polish is complete.

### Decision: React Router + Page Split + URL Contract
- Date: 2026-05-03
- Context:
  - `App.tsx` was ~720 lines and rendered both calculator and wizard via a hash flag.
  - Backend phase will need shareable deep-links (open document/calculator by ID, share read-only links, pre-fill from HubSpot context).
  - Stepper UI was breaking ("Parties & Signatures" wrapped to two lines) and pre-existing F5/F6 UX issues lingered (source mode reset scope/parties).
- Decision:
  - Adopt `react-router-dom` v7 (`BrowserRouter`); nginx already serves SPA fallback (`try_files`).
  - Lift calculator state into `CalculatorProvider` so both pages share the same live data.
  - Split `App.tsx` into router shell + `AppShell` + `pages/CalculatorPage` + `pages/WizardPage` + `NotFoundPage`.
  - Wizard exposes `?source`, `?scope`, `?step` query params as URL contract.
  - Document the contract in `docs/url_contract.md` (current routes + planned `/calculator/:id`, `/wizard/:id/edit`, `/share/:token`).
  - Stepper labels shortened (`Header`, `Fees`, `Parties`) and `whitespace-nowrap` enforced.
  - Preserve `documentScope` and `agreementParties` when source mode changes.
  - Fixed 2 wizard lint warnings; only the calculator-frozen warning remains.
  - Decompose `fromCalculator.ts` (412 → 175 lines) into:
    - `seedHelpers.ts` — shared helpers (cloning, header builder).
    - `manualSeeds.ts` — `buildDocumentTemplatePayloadManualBlank` + `…ManualDefaults`.
    - `fromCalculator.ts` — calculator-source builder + re-exports.
- Alternatives considered:
  - Keep hash routing — uglier URLs, harder to share.
  - TanStack Router — overkill for two pages.
  - Reset draft on source switch — loses user's party data.
- Consequences:
  - URL is shareable: `/wizard?source=manualBlank&scope=offerAndAgreement&step=7`.
  - Adding `/calculator/:snapshotId` and `/wizard/:documentId/edit` in Phase 8 is purely additive.
  - JS bundle: 391 → 482 KB (+90 KB for router); gzipped 103 → 132 KB. Acceptable.
  - Test count: 151 → 176 (+25: AGREEMENT renderer, Stepper, scope clamp).
- Follow-up actions:
  - Implement Phase 8 backend per [phase_08_backend_plan.md](phase_08_backend_plan.md).
  - Wire deep-links (`/calculator/:id`, `/wizard/:id/edit`, `/share/:token`) once backend ships.

### Decision: AGREEMENT Template Updated to DRAFT TEXT.docx (1:1 alignment)
- Date: 2026-05-03
- Context:
  - User provided the canonical `DRAFT TEXT.docx` MSA template and asked for the renderer to match it 1:1, dropping any older content.
  - Old template was based on `Extended Schedule 4 - MSA format.docx` and used inline `(i) (ii) (iii)` enumerations, title-case main headings, and inline bold leads for every subsection (including Dispute Resolution).
  - New draft restructures content with explicit bullet lists, uppercase main headings, and standalone uppercase headings for Dispute Resolution sub-clauses while keeping inline leads only for Payment subsections.
- Decision:
  - Replace `agreementPdf/sections.ts` content verbatim from DRAFT TEXT.docx; introduce typed block model: `paragraph` | `lead` | `heading` | `list` (with optional nested `subItems`).
  - Renderer: `agreementPdf/index.ts` dispatches per block kind. Lists become `<ul class="agreement-list">` with `<ul class="agreement-sublist">` for the nested Merchant-Offering items in Reps & Warranties (m).
  - Styles: `.agreement-h2` and `.agreement-h3` both `text-transform: uppercase` 11pt bold black; new `.agreement-list` / `.agreement-sublist` rules; new `.agreement-p-bold` for the bold uppercase opener.
  - Parties block: drop the standalone "Parties" heading; open with `THIS SERVICE AGREEMENT (THE "AGREEMENT") IS ENTERED INTO BETWEEN:` rendered as bold uppercase paragraph.
  - Restore the missing Binding Arbitration paragraph: "If Merchant demands arbitration, it shall simultaneously send a copy of the completed demand to the following addresses: 1) [KASEF PAY address] …" — this content was previously omitted.
  - `[]` placeholders unchanged: `[Merchant legal name]`, `[*]` for jurisdiction, `[*]` for registered office. All three already exposed in `PartiesStep`. No new variables introduced.
- Alternatives considered:
  - Keep the old template + apply only style tweaks (rejected — content was structurally outdated).
  - Use `<ol type="i">` numbered lists (rejected — DRAFT TEXT renders as plain bullet items without explicit enumeration).
  - Hard-code "Section 13" reference and KASEF PAY address verbatim (kept verbatim per draft, with note that any future co-entity override in the wizard does not affect this hardcoded clause).
- Consequences:
  - AGREEMENT body now matches the authoritative draft 1:1.
  - 183/183 tests pass (added 3 new tests for standalone DR-headings, inline Payment leads, and bulleted lists; 1 existing test relaxed for "Parties" heading removal).
  - `agreement_structure.md` updated with new visual rules and source attribution.
- Follow-up actions:
  - If product later wraps additional contract values in `[brackets]`, add them as fields to `AgreementParties` and corresponding inputs in `PartiesStep`.

### Decision: Phase 8 Backend Spec Finalized — Express + Drizzle + Postgres + Puppeteer + JWT
- Date: 2026-05-03
- Context:
  - All open questions from the initial Phase 8 kickoff plan answered by product.
  - Frontend is locked at 173 → 180 tests, two document scopes, AGREEMENT styled to signed references.
- Decision (summary; full spec in [phase_08_backend_plan.md](phase_08_backend_plan.md)):
  - **Stack**: Node 20 + Express + Drizzle ORM/Kit + PostgreSQL 15 + Puppeteer + bcrypt + JWT.
  - **Auth**: email/password, admin-created users only, JWT access (15 min) + refresh (30 d).
  - **Save flow**: explicit "Confirm" creates immutable `documents` row with allocated `BSG-#####` number; preview-only stays as today.
  - **HubSpot**: columns reserved on `documents` and `clients`; no API calls until Phase 9.
  - **Out of scope**: webhooks, public share tokens, RBAC, email delivery, DOCX export, multi-tenant, audit table, object-storage caching of PDFs.
  - **Schema**: 7 tables — `users`, `refresh_tokens`, `clients`, `calculator_snapshots`, `documents`, `document_number_sequence`, `wizard_drafts`.
  - **Seed data**: 3 users, 3 clients, 2 snapshots, 3 documents for dev/test.
- Alternatives considered:
  - NestJS + Prisma (rejected — heavier than needed for the API surface).
  - Object storage / S3 caching of rendered PDFs (rejected for Phase 8 — Puppeteer on-demand is enough).
  - Public share tokens (deferred — not needed before HubSpot phase).
- Consequences:
  - Frontend payload contract (`DocumentTemplatePayload`) becomes the canonical Zod schema shared with backend.
  - `BSG-DRAFT-{ts}` placeholder will be replaced by the real numbering service per spec.
  - HubSpot phase (Phase 9) is unblocked once Phase 8 ships — only API calls and outbound sync need wiring.
- Follow-up actions:
  - Begin implementation work in `server/` per the spec.
  - Track ⏳ → ✅ progress in `spec_v2_alignment.md` as endpoints land.

### Decision: AGREEMENT Visual Style Aligned to Signed References + Two-Scope Lock + Backend Not Yet Started
- Date: 2026-05-03
- Context:
  - Product confirmed only two document scopes: `offer` and `offerAndAgreement`. The transitional `agreement` (agreement-only) scope was removed entirely.
  - User provided two signed MSA references (`CEI Commercial Offer 1.0 and MSA (for signature).pdf`, `ZenCreator Commercial Offer 1.1 (signed).pdf`) showing the desired AGREEMENT typography.
  - User requested explicit clarity in documentation that backend implementation has not started — the only artifact for Phase 8 is a kickoff plan awaiting product decisions on stack and schema.
- Decision:
  - **DocumentScope** is now `"offer" | "offerAndAgreement"`. All UI options, dropdown values, URL params, tests, and docs use these two values. Stale `"agreement"` references removed across code and docs.
  - **AGREEMENT typography** updated in `pdf-kit/styles.ts`:
    - Section headings (`.agreement-h2`): plain bold black, 11pt, top-margin 22pt — no accent color, no large size.
    - Body paragraphs (`.agreement-p`): 10.5pt, line-height 1.5, fully justified, 14pt bottom margin.
    - Removed `.agreement-h3` block-level subsection style.
  - **Subsection titles** (`Tax Levy`, `Taxes Generally`, `Binding Arbitration`, etc.) now render as **inline bold leads** on the first paragraph of the block via `<span class="agreement-lead">`, ending with a period. They no longer occupy their own line.
  - **Backend status documented**: `docs/phase_08_backend_plan.md`, `docs/architecture.md`, and `docs/spec_v2_alignment.md` carry an explicit "implementation not started — kickoff plan only" notice.
  - **Future variable template note**: `docs/agreement_structure.md` records the planned `[variable]` extension path: when the user supplies an updated MSA template with `[variable]` markers, those become typed inputs in the wizard's Parties step and substitute via the existing variable-highlight helpers.
- Alternatives considered:
  - Keep accent color on agreement headings (rejected — references show plain black bold).
  - Render subsections as separate `<h3>` lines (rejected — references show inline bold leads).
  - Start Phase 8 implementation in parallel (rejected — pending product confirmation of stack and schema).
- Consequences:
  - AGREEMENT body now reads as a clean legal document matching the signed-version look.
  - All 173 tests still pass; no functional change to OFFER body or calculator.
  - Backend phase remains explicitly gated on product answers to the open questions in `phase_08_backend_plan.md`.
- Follow-up actions:
  - Wait for product to provide the updated MSA template with `[variable]` markers.
  - Wait for product answers to Phase 8 open questions before backend implementation begins.

### Decision: PDF Renderer Phase 2 — AGREEMENT renderer, Document Type dropdown, scope-aware wizard
- Date: 2026-05-03
- Context:
  - Phase 1 added `documentScope` and lifted hardcoded Section 4 legal terms into the wizard payload.
  - Product confirmed two document scopes: `Offer` (Commercial Pricing Schedule) and `Offer + Agreement` (Commercial Pricing Schedule + Terms of Agreement). A standalone "agreement-only" output is not offered.
  - Product also clarified that the scope selector lives inside the existing `Document Type` field — no separate "Document Scope" field in UI.
  - AGREEMENT body must use the static MSA text from `Extended Schedule 4 - MSA format.docx` with placeholder substitution (no editable paragraphs); only counterparty fields are user input.
  - Preview must visually highlight changed/substituted variables; the generated PDF must remain clean (highlights screen-only).
- Decision:
  - **Single `Document Type` dropdown** — drives `documentScope` and `header.documentType` together. Three options:
    - `Commercial Pricing Schedule` → scope `offer`,
    - `Commercial Pricing Schedule Terms of Agreement` → scope `agreement`,
    - `Commercial Pricing Schedule + Terms of Agreement` → scope `offerAndAgreement`.
  - **AGREEMENT renderer** in new `src/components/document-wizard/agreementPdf/`:
    - `sections.ts` — full MSA body as a typed array of sections (16 main sections, with sub-sectioned Payment and Dispute Resolution).
    - `parties.ts` — opening Parties block with placeholder substitution.
    - `signatureBlock.ts` — three-panel signature block.
    - `highlightVar.ts` — `<span class="var-substituted var-{filled|default|placeholder}">` wrapping for screen-only highlight.
    - `index.ts` — `buildAgreementBodyHtml(payload)` orchestrator.
  - **Counterparty data** in `legalDefaults.ts`:
    - `BSG_ENTITY` (static identity).
    - `DEFAULT_AGREEMENT_PARTIES` (KASEF PAY co-entity defaults + empty merchant fields).
    - `AGREEMENT_PARTY_PLACEHOLDERS` (`[Merchant legal name]`, `[*]`) — rendered when merchant fields are blank.
  - **Renderer composition** in `buildOfferPdfHtml.ts` is scope-aware:
    - `offer` → header (with COLLECTION MODEL / FREQUENCY) + Sections 1–4 + footer.
    - `agreement` → header (without pricing meta and meta-note) + AGREEMENT body + footer.
    - `offerAndAgreement` → header + Sections 1–4 + AGREEMENT body + footer (one document, page numbering via CSS `counter(pages)`).
    - New `BuildOfferPdfHtmlOptions { highlightVariables }` adds `class="highlight-variables"` to body when set; print stylesheet strips highlights.
  - **Wizard payload extension**: `agreementParties: AgreementParties` added to `DocumentTemplatePayload`. All three builders seed defaults.
  - **Wizard steps now scope-aware**:
    - `getVisibleSteps(scope)` returns only relevant steps.
    - `agreement` scope hides pricing steps (2–5).
    - All scopes show new `Parties & Signatures` step (id 7) when scope ∈ {agreement, offerAndAgreement}.
    - Stepper UI numbers visible steps sequentially (1..N) regardless of step value, so the sparse step ids stay invisible to the user.
  - **`PartiesStep`** holds three groups: BSG (static info card), Service Provider co-entity (4 editable fields, KASEF PAY defaults), Merchant (3 editable fields, blank by default).
  - **`PreviewStep`** gets a "Highlight variables" toggle and a legend (yellow = filled, indigo = default, orange = unfilled placeholder).
  - **Calculator math untouched.** All 151 tests still pass.
- Alternatives considered:
  - Keep a separate "Document Scope" dropdown alongside readonly Document Type. Rejected — duplicate UI per product feedback.
  - Render AGREEMENT as a separate PDF document instead of one bundle. Rejected — spec section 6 + sample bundles (ZenCreator, ATOM, CEI) confirm a single combined document with shared header/footer.
  - Make MSA paragraphs editable in wizard. Rejected — product wants static legal text; only placeholder fields editable.
  - Add highlight via post-process of preview HTML in the iframe. Rejected — cleaner to set body class once at render time and let CSS do the rest.
- Consequences:
  - Wizard now supports three real document outputs from a single payload contract.
  - AGREEMENT body lives in one TypeScript file; changing legal text is a single edit.
  - Bundle JS grew from ~390 KB to ~440 KB (compressed 103 → 119 KB) — primarily MSA text.
  - Variable highlighting helps reviewers quickly scan filled-in fields without polluting the printed PDF.
- Follow-up actions:
  - DOCX export — separate phase.
  - Backend numbering service replaces `defaultDraftNumber()` (FN.1) when Phase 8 lands.
  - When HubSpot phase opens, party fields (`agreementParties`) become auto-filled from HubSpot Deal/Company records.

### Decision: PDF Renderer Phase 1 — Lift Section 4 Legal Defaults + DocumentScope Foundation
- Date: 2026-05-03
- Context:
  - Visual fidelity audit against 8 reference offer samples flagged that `Settlement Note`, `Client Type`, and `Restricted Jurisdictions` were hardcoded in the renderer (`offerPdf/sections/terms.ts`) and could not be edited per contract.
  - Product also confirmed that the wizard must support a document-scope choice — `Offer` / `Agreement` / `Offer + Agreement` — with the AGREEMENT body sourced from the MSA Extended Schedule 4 template.
  - To keep the change small and verifiable, AGREEMENT renderer + UI dropdown were deferred to Phase 2; Phase 1 lays the type-level foundation only.
- Decision:
  - Add `src/components/document-wizard/legalDefaults.ts` holding canonical `DEFAULT_DOCUMENT_LEGAL_TERMS` (Settlement Note, Client Type, Restricted Jurisdictions) and `DocumentScope` type with default `offer`.
  - Extend `DocumentTemplatePayload`:
    - new top-level field `documentScope: "offer" | "offerAndAgreement"`,
    - new `contractSummary` fields `settlementNote`, `clientType`, `restrictedJurisdictions` (strings).
  - Seed all three builders (`buildDocumentTemplatePayloadFromCalculator`, `…ManualDefaults`, `…ManualBlank`) with the new defaults via spread from `DEFAULT_DOCUMENT_LEGAL_TERMS` and `DEFAULT_DOCUMENT_SCOPE`.
  - Step 5 (Terms) gains an editable "Legal Terms" panel for the three new fields.
  - Renderer (`offerPdf/sections/terms.ts`) reads values from payload; remove the old `TERMS_DEFAULTS` constant block.
  - Annotate `defaultDraftNumber()` in `fromCalculator.ts` as the Phase 1 placeholder (FN.1) — Phase 8 numbering service will replace it.
- Alternatives considered:
  - Keep the three fields hardcoded as project-wide defaults (rejected — product needs per-contract editability).
  - Add the fields to calculator state (rejected — not calculator concerns; pollutes calculation domain).
  - Implement the AGREEMENT renderer in the same pass (rejected — too large to land safely; split into Phase 2).
- Consequences:
  - Wizard now supports per-contract overrides for the three Section 4 legal lines without touching the calculator.
  - `documentScope` is a stable type-level foundation that Phase 2 will hook into for scope-aware step orchestration and renderer composition.
  - All 151 tests still pass; calculator math, OFFER renderer pixel layout, and bundle remain stable (CSS unchanged at 21.85 kB).
- Follow-up actions:
  - Phase 2: Step 1 dropdown, Parties & Signatures step, `agreementPdf/` module, scope-aware orchestrator.
  - Update `pdf_renderer_audit_2026-05-02.md` once Phase 2 lands.

### Decision: P1–P5 Decomposition Pass + ESLint
- Date: 2026-05-02
- Context:
  - Audit `docs/audit_2026-05-02.md` flagged five maintainability items (P1 OFFER renderer size, P2 PDF UI Kit primitives size, P3 Zone 5 profitability size, P4 lint stage gap, P5 payload type naming drift).
  - User explicitly approved acting on all five with the constraint that the calculator's business logic and visible behavior must not change.
- Decision:
  - **P5 (rename)** — Renamed canonical wizard payload type `DocumentWizardTemplateData` → `DocumentTemplatePayload` and the four `buildDocumentWizardTemplateData…` helpers to `buildDocumentTemplatePayload…`. `BuildDocumentWizardTemplateInput` → `BuildDocumentTemplatePayloadInput`. Aligns frontend code with `phase_07_unified_document_pipeline_plan.md` ahead of the backend phase. Pure rename across 13 files, no behavior change.
  - **P1 (renderer split)** — `buildOfferPdfHtml.ts` (607 lines) reduced to ~80-line orchestrator. Helpers moved under `src/components/document-wizard/offerPdf/`: `formatters.ts`, `layoutResolution.ts`, `sections/{payin,payout,fees,terms}.ts`. Public entry `buildOfferPdfHtml(data)` unchanged.
  - **P2 (PDF UI Kit split)** — `pdf-kit/primitives.ts` (447 lines) split into per-component files under `pdf-kit/components/` plus `pdf-kit/styles.ts` and `pdf-kit/types.ts`. `pdf-kit/primitives.ts` kept as a barrel re-export so existing imports remain valid.
  - **P3 (Zone 5 split)** — `domain/calculator/zone5/profitability.ts` (615 lines) split into `types.ts`, `constants.ts`, `internals.ts`, `payin.ts`, `payout.ts`, `other.ts`, `total.ts`. Original file is now a barrel. **No formula or business-logic change**; this is the single hardest constraint of the cycle. Verified by identical 151/151 test outputs and identical final JS bundle hash to the pre-split build.
  - **P4 (ESLint)** — Added flat-config ESLint v9 with `typescript-eslint@^8`, `eslint-plugin-react@^7`, `eslint-plugin-react-hooks@^7`, `@eslint/js@^9`, `globals@^17`. `npm run lint` script wired into `npm run verify` and `.github/workflows/ci.yml`. Ignores `dist/`, `node_modules/`, `coverage/`, `.claude/**` (worktrees), and `server/**` (Phase 8 skeleton). Current state: 0 errors, 3 pre-existing warnings left as-is.
- Alternatives considered:
  - Combine P3 with formula tuning (rejected — calculator frozen).
  - Use stricter lint rules (e.g. `no-explicit-any` as error). Deferred — current goal is gate parity, not new policy.
  - Delete pre-existing lint warnings now. Deferred — one of them is in calculator code (frozen) and the other two are tiny in non-blocking paths.
- Consequences:
  - `useCalculatorDerivedData.ts` and the calculator domain remain bit-for-bit identical at the bundle level.
  - All decomposed modules have single, focused responsibilities; AGREEMENT or DOCX work in the future will land in clean structure.
  - CI now runs `typecheck → lint → test → build`.
  - Wizard ↔ backend payload contract is named consistently (`DocumentTemplatePayload`).
- Follow-up actions:
  - Address P6 (document number placeholder comment) when next touching wizard helpers.
  - Optionally clean the 3 pre-existing lint warnings during a future calculator-touching pass with explicit product approval.

### Decision: PDF Visual Pass + Per-Fee "N/A" Toggles
- Date: 2026-05-07
- Context:
  - The frontend PDF generation flow had several rough edges that were
    blocking real visual testing against the CEI / ZenCreator reference
    PDFs:
    1. Print path opened a popup window, which Brave/Safari blocked or
       returned `null` for when `noopener` was set.
    2. Multi-page documents had no per-page footer that matched the
       references (`position: fixed` overlapped content).
    3. Long agreement sections were forced to fit on one page via
       `page-break-inside: avoid`, leaving large blank gaps.
    4. Numeric pricing values had inconsistent visual treatment
       (single accent purple; the references use distinct colours
       per tier and gray for "not applicable" states).
    5. The schema had no notion of "this fee is intentionally N/A";
       there was no way to express e.g. "C/D: €0.50, APM: N/A".
    6. Region label `EU` did not match the regulatory wording the
       business uses externally (`EEA + UK`).
  - All work had to land in the wizard payload + PDF renderer only;
    the calculator is frozen by product (see user memory
    `feedback_calculator_frozen.md`). Any calculator-side parity
    work is deferred and tracked in
    `docs/calculator_deferred_changes.md`.
- Decision:
  - **Iframe-based print** — replaced `window.open` + `popup.print()`
    with a hidden `<iframe>` that loads a Blob URL and calls
    `iframe.contentWindow.print()` after `document.fonts.ready` and
    two animation frames. Helper lives in
    `src/lib/printHtmlViaIframe.ts`. Eliminates popup blockers,
    avoids the `noopener` `null`-return trap, and works around
    Safari's `srcdoc` "about:blank" print bug.
  - **Per-page footer via `<table><tfoot>`** — the document content
    is wrapped in `<table class="page-layout">`; the disclaimer
    footer lives in `<tfoot>`. Chrome's print engine reliably
    repeats `<tfoot>` on every printed page and reserves vertical
    space for it (no overlap). Single source of HTML implies a
    single visual definition.
  - **Page counter via `@page` margin box** — `counter(page)` and
    `counter(pages)` evaluate to 0 inside `<table><tfoot>`
    (long-standing Chromium bug 678485), so the page number lives
    in `@page { @bottom-right }` instead. Footer in tfoot keeps
    the disclaimer + meta line; bottom-right margin box prints
    `Page N of M`.
  - **Targeted page-break protections** — added
    `page-break-inside: avoid` to small leaf blocks that must not
    split (`.fee-card`, `.terms-item`, `.signature-panel`, data
    table `tr`, `.offer-section` for whole numbered blocks); added
    `page-break-before: always` on `.agreement-body` so the MSA
    starts on a fresh page in the bundled scope. Removed the
    aggressive avoid-rule on `.agreement-section` so long MSA
    paragraphs split across pages cleanly.
  - **Per-fee N/A toggles (boolean flags option)** — each fee value
    in `DocumentTemplatePayload` now has a sibling `*Na: boolean`
    flag. Specifically: `PayinFeeBlock.{trxCcNa,trxApmNa}` (single
    + each tier, both regions), `PayoutFeeBlock.trxFeeNa` (single
    + each tier), `contractSummary.{payoutMinimumFeeEuNa,
    payoutMinimumFeeWwNa}`, `toggles.payoutMinimumFeePerTransactionNa`.
    Three render states per fee:
      1. value > 0 + flag off → display value
      2. value = 0 / empty → block hidden by global hide-if-empty rule
      3. flag on → display literal "N/A"
    Flag wins over value. Calculator never emits `true` for any of
    these — defaults all flow through `fromCalculator.ts`,
    `manualSeeds.ts`, `seedHelpers.clonePayinRegionPricing`,
    `seedHelpers.clonePayoutPricing` as `false`. The user toggles
    them in the wizard.
  - **Wizard UI: `FeeFieldWithNa`** — new shared component in
    `wizard/shared.tsx` pairs `NumberField` with a checkbox; the
    field is `readOnly` while the flag is on. Used in PayinStep,
    PayoutStep, OtherFeesStep. TermsStep uses plain checkboxes for
    the per-region MIN. TRX FEE flags (because the underlying
    threshold/fee values are shared in `overall` mode) and locks
    the related `NumberField`s based on a small rule:
      - Overall mode → shared inputs lock when both EU + WW flags
        are on.
      - By-region mode → each region's pair locks based on its own
        flag.
  - **Visual colour scheme** — added `:root --label-color: #2358EA`
    and three `.tier-color-{1,2,3}` classes. Application:
      - `--label-color` (`#2358EA`) → `th`, `.fee-card h3`,
        `.terms-label`, `.meta-label` (all small uppercase headings).
      - `.tier-color-1` `#2358EA` → first tier in tiered mode AND
        the single-mode default for primary pricing values
        (model name + trx fees) on both payin and payout.
      - `.tier-color-2` `#3F38E3`, `.tier-color-3` `#7D2AEB` → 2nd
        and 3rd tiers in tiered mode.
      - `.value-na` (`var(--text-muted) #6B7280`) → any line that
        renders "N/A". The MIN. TRX FEE secondary line "&gt;X: N/A"
        is muted on its full width (the prefix and the literal
        N/A both gray) so any line containing N/A reads
        consistently.
      - `.cell-subtitle` (`var(--text-light) #9CA3AF`) → secondary
        line inside cells (APM brand list, "All Visa & Mastercard",
        "Non-tiered, fixed", "Credit / Debit & APM").
      - MDR percent stays in body default colour on every tier so
        it reads as plain dark text.
  - **Percent format** — `formatPercent` rewritten to always render
    exactly two decimals (`5.00%`, `4.50%`, `0.30%`, `0.01%`). The
    callers passing `0` for fractionDigits in `terms.ts` and
    `fees.ts` were updated to use the default. Wizard input fields
    still display via the calculator's frozen `NumberField`
    (see deferred entry #2).
  - **Region label rename** — `EU` to `EEA + UK` in the OFFER PDF
    table region column and the wizard PayinStep label. Underlying
    state key `eu` and calculator-side regionLabel typing are
    unchanged (still `"EU" | "WW"` in the calculator) — only the
    user-facing label changed.
  - **Meta grid reorder + 5-cell layout** — header meta items
    now order as `DOCUMENT NUMBER`, `DOCUMENT DATE`, `DOCUMENT
    TYPE`, `COLLECTION MODEL`, `COLLECTION FREQUENCY`. The
    container border was reduced to top + left only so the empty
    6th-cell slot does not render a closed rectangle on the
    right; items 1-5 keep their full borders.
  - **Card Acquiring column widths** — `<th>` cells got per-column
    classes; widths in CSS shifted weight to METHODS (~25%) and
    MIN. TRANSACTION FEE (~22%) so MIN. TRANSACTION FEE fits one
    line. `table-layout: fixed` (already in place) propagates the
    widths to body cells.
  - **Header / cell alignment** — `th` is `text-align: center` +
    `vertical-align: top` (so wrapped multi-line headers align
    with neighbouring single-line ones); `td` is `text-align:
    left` with `padding-left: 14px` so values share a single
    indent across rows.
  - **Calculator mode hint removed** — FAILED TRX CHARGING card
    no longer renders the "Calculator mode" subtitle. `ServiceCard`
    and `FeeCardItem` `subtitle` field is now optional and the
    `feesGrid` renderer skips the `<p class="fee-subtitle">` when
    absent.
  - **APM text hyphen** — methods cell strings switched from em-
    dash to short dash:
    `Credit / Debit - Visa, Mastercard`,
    `APM - Apple Pay, Google Pay`. Section header
    `Card Acquiring — Credit / Debit Cards, APM & E-wallet` keeps
    the em-dash (no change requested there).
- Alternatives considered:
  - **Discriminated union for fee values** (`{ kind: "value" | "na" }`)
    instead of paired boolean flags. Cleaner type-wise but every
    consumer (calculator import, wizard renderer, tests, manual
    seeds) would need updating. Boolean flag wins on minimal blast
    radius given the calculator-frozen constraint.
  - **`<table><thead>` repeating header** for per-page document
    title. Deferred — production Puppeteer will inject
    headers/footers via `displayHeaderFooter` so frontend doesn't
    need to perfectly emulate the per-page heading.
  - **Native browser headers/footers** instead of our own
    disclaimer footer. Rejected — references include the full
    legal disclaimer paragraph, which doesn't fit a `@page` margin
    box.
  - **In-place style writing for tier colour** (e.g.
    `style="color: ${TIER_COLORS[i]}"`). Rejected — CSS classes
    are easier to override and to verify in tests.
- Consequences:
  - 200/200 tests pass; new tests cover N/A rendering on both
    payin/payout, per-tier colours, MDR-percent default colour,
    APM cell-subtitle class, MIN. TRX FEE secondary line muting,
    and the removed Calculator-mode subtitle.
  - The OFFER PDF visual now matches the CEI / ZenCreator
    references in spirit: per-page disclaimer footer, per-tier
    coloured rows, gray N/A states, blue labels.
  - The wizard exposes the full N/A surface so QA can flip any
    fee independently and inspect the resulting PDF.
  - `docs/calculator_deferred_changes.md` lists three pending
    parity items for the calculator phase: region label
    (`EU` to `EEA + UK`), 2-decimal percent display in calculator
    inputs, and an optional sharing of the `FeeFieldWithNa`
    pattern back into Zone 3.
- Follow-up actions:
  - When the calculator is unfrozen, walk the deferred-changes
    log in order and apply the calculator-side parity.
  - Add Puppeteer-side `displayHeaderFooter` template in Phase 8
    so the production PDF gets per-page numbers/doc id without
    relying on the `@page` margin box trick.

### Decision: Custom Terms Blocks + TermsStep Decomposition + tierColor Dedupe
- Date: 2026-05-07
- Context:
  - Two product-driven additions and one refactor pass, all
    locked to the wizard payload + PDF renderer (calculator
    remains frozen):
    1. Number / N/A / TBD picker (`ModedNumericField`) extended
       to all four Transaction Limits fields and Reserve Cap so
       the wizard's mode handling is uniform across every
       optional numeric value.
    2. Auto-N/A pairing for Min/Max Payout was removed — the user
       now picks N/A explicitly. Empty + value mode hides the row;
       no implicit defaults anywhere in the system.
    3. New "Custom Terms Blocks" feature: the user can append free
       rows (heading + body + Blue/Black/Orange colour) to the
       Terms & Limitations grid. Headings render in the standard
       blue label colour; bodies use the user-picked colour.
    4. Architectural audit revealed two problems worth fixing:
       a. `tierColorClass(index)` was duplicated verbatim in both
          `offerPdf/sections/payin.ts` and `payout.ts`.
       b. `wizard/steps/TermsStep.tsx` had grown to 506 lines with
          5 logically independent cards (legal terms, transaction
          limits, rolling reserve, payin min fee, custom blocks)
          all inlined.
- Decision:
  - **Custom blocks data model.** Added type-only entries:
    `CustomTermsItemColor = "blue" | "black" | "orange"` and
    `CustomTermsItem { id, label, value, color }`. Stored as
    `contractSummary.customTermsItems: CustomTermsItem[]` (default
    `[]`). The PDF renderer (`offerPdf/sections/terms.ts`) appends
    each filled custom item after the built-in rows in the same
    `terms-grid` so layout / page-break behaviour is identical.
    Empty entries (no label and no body) are dropped.
  - **CSS classes.** Added `.terms-value-blue` (#2358EA matches
    `--label-color` and tier-color-1), `.terms-value-black`
    (default `--text-primary`), `.terms-value-orange` (#DB7712).
    `.terms-value-custom { white-space: pre-wrap; word-break:
    break-word }` keeps long bodies inside the column. Built-in
    rows stay unchanged (no `valueColor` set in the renderer).
  - **Number / N/A / TBD picker generalised.** Added
    `valueModes.{collectionLimitMin, collectionLimitMax,
    payoutLimitMin}` so all five "number | null" fields share the
    same `ModedNumericField` UI. The PDF reads each via
    `resolveModeValue`. No more auto-defaults — explicit only.
  - **N/A gray rule extended.** `renderTermsGrid` and
    `renderFeesGrid` now wrap a literal "N/A" value in
    `<span class="value-na">` (muted gray), matching the rule
    already in place for the pricing tables. TBD stays in default
    colour. Standard built-in rows that produce N/A through
    `resolveModeValue` get the gray treatment automatically.
  - **`tierColorClass` extracted to `offerPdf/tierColor.ts`** and
    imported by both payin + payout. Both renderers now share the
    single source of truth for tier colour mapping.
  - **TermsStep decomposed** into `wizard/steps/terms/`:
      - `TermsLegalSection.tsx` (Settlement Period dropdown +
        Settlement Note + Client Type + Restricted Jurisdictions)
      - `TransactionLimitsSection.tsx` (4 ModedNumericField rows)
      - `RollingReserveSection.tsx` (% + days + cap)
      - `PayinMinimumFeeSection.tsx` (overall/byRegion toggle +
        threshold/fee inputs with region-aware lock + per-region
        N/A checkboxes)
      - `CustomTermsBlocksSection.tsx` (add / edit / remove +
        colour picker)
      - `terms/index.ts` barrel
    `TermsStep.tsx` is now a 48-line orchestrator.
- Alternatives considered:
  - **Discriminated union for fee/limit values** instead of
    `valueModes` map. Rejected previously and unchanged here —
    the boolean / mode-flag approach keeps `number | null`
    semantics intact for the calculator import path.
  - **Decompose `wizard/shared.tsx` (357 lines) and
    `pdf-kit/styles.ts` (679 lines)** during the same pass.
    Deferred — `shared.tsx` would change import paths in many
    files; `styles.ts` is a CSS-in-string blob where splitting
    has small return on investment.
- Consequences:
  - 215/215 tests pass (+5 covering custom blocks rendering,
    multiple colours, dropped empty entries, default empty
    array, and that built-in rows stay uncoloured).
  - `TermsStep.tsx` reads as a 48-line list of sub-sections.
    Each section file is 60-150 lines and has a single concern.
  - `tierColorClass` lives in one place; both payin and payout
    import the helper.
  - `docs/architecture.md` module map refreshed to mention the
    new `terms/*`, `offerPdf/tierColor`, `printHtmlViaIframe`,
    and `wizard/shared` primitives.
- Follow-up actions:
  - When the calculator is unfrozen, walk the deferred-changes
    log (`docs/calculator_deferred_changes.md`) and apply the
    calculator-side parity items.
  - Revisit `wizard/shared.tsx` decomposition if it grows
    further or new wizard-wide primitives land.

### Decision: PartiesStep — Service Provider Co-entity edit lock
- Date: 2026-05-07
- Context:
  - The Service Provider Co-entity card on Step 7 (Parties &
    Signatures) defaults to KASEF PAY INC and is overridden only
    when a different acquiring/processing partner is used. Most
    contracts ship with the defaults and a misclick into one of
    those four inputs would corrupt them silently.
- Decision:
  - Wrap the four co-entity inputs (Legal Name, Short Label,
    Jurisdiction, Registered Office) with a local "Edit" toggle.
    The lock is `useState`-based and **not persisted** in
    `DocumentTemplatePayload` — every re-entry into the step
    starts locked, so the user has to opt in to edit each time.
  - When locked, inputs render with `readOnly` + `aria-readonly`,
    a gray fill, the not-allowed cursor and a suppressed focus
    ring. Centralised in a `lockedInputClass` const so the four
    fields stay visually in sync.
  - The Black Stripe Group LTD card (static identity) and the
    Merchant card (always editable, populated per-contract or
    via HubSpot/DB later) are unchanged.
- Alternatives considered:
  - **Persist the lock flag in the payload.** Rejected — the
    lock is a UX safeguard, not contract data; persisting would
    make the wizard remember an "unlocked" state across sessions
    and undermine the safeguard.
  - **Per-input lock.** Overkill for a 4-field card that always
    moves together for a given contract.
- Consequences:
  - Step 7 reads as "static defaults until you opt in to edit",
    matching how the field group behaves at the contract level.
  - 215/215 tests still pass; behaviour change is wizard-only.
  - `architecture.md` module map already covers Step 7 via
    `wizard/steps/PartiesStep.tsx`; no further doc table edits
    needed.
- Follow-up actions:
  - If/when the wizard gains a "save draft" feature in Phase 8,
    decide whether the lock state should be remembered on resume
    (probably no — re-locking on resume keeps the safeguard).

### Decision: Section custom notes (Payin + Payout)
- Date: 2026-05-07
- Context:
  - Some commercial offers carry an asterisked footnote under the
    pricing table (e.g. *"Min. Transaction fee applies to
    successful transaction fees only..."*). These vary per
    contract and weren't expressible in the wizard payload —
    historically a manual post-edit of the rendered PDF.
- Decision:
  - Schema. Added four fields to `contractSummary`:
    `payinCustomNoteEnabled`, `payinCustomNoteText`,
    `payoutCustomNoteEnabled`, `payoutCustomNoteText`. Defaults
    flow through `fromCalculator.ts`, `manualSeeds.ts` and the
    test fixture as `false` / `""`.
  - Rendering. `offerPdf/sections/payin.ts` and `payout.ts` each
    append `<p class="section-custom-note">…</p>` after the
    table when both `enabled === true` and the text is non-blank.
    The CSS class lives in `pdf-kit/styles.ts` and renders in
    muted gray (`var(--text-light)` `#9CA3AF`), 8pt, line-
    height 1.4, with `white-space: pre-wrap` so user line breaks
    survive into the PDF. `page-break-inside: avoid` keeps the
    note attached to its table.
  - Wizard UI. New shared component `SectionCustomNoteCard`
    (toggle + textarea, textarea locked while toggle is off).
    PayinStep and PayoutStep both render an instance at the
    bottom of their step. The component is reused so the two
    steps stay visually identical.
- Alternatives considered:
  - Single shared note used by both sections. Rejected — the
    references show different notes per pricing table.
  - Auto-prepending an asterisk. Rejected — keep the user free
    to write whatever marker they want (or none at all).
- Consequences:
  - 220/220 tests pass (+5 covering the new behaviour: render
    when enabled, hide when toggle off, hide when text blank,
    payout-only path, both notes independent).
  - The wizard payload now expresses every footnote / disclaimer
    that appears in the OFFER PDF; no more out-of-band edits.
- Follow-up actions:
  - When the calculator is unfrozen, decide whether the
    calculator should also surface custom-note inputs to seed
    the wizard. For now they only live in the wizard / payload
    layer and default to `false`.

### Decision: Wizard Audit + Reusable Primitives Pass
- Date: 2026-05-07
- Context:
  - End-of-day audit of the wizard codebase after a high-volume
    feature day. Goals: confirm calculator → wizard data flow,
    surface duplication, identify decomposition candidates,
    align documentation with the actual code.
- Decision:
  - **Calculator → wizard**: data flow is correct end-to-end.
    Every field on `DocumentTemplatePayload.contractSummary`,
    `payin`, `payinPricing`, `payoutPricing`, `toggles` is
    populated by `fromCalculator.ts`. All `*Na` flags default to
    `false`; `valueModes` is left undefined (user picks via the
    wizard). Tier arrays are `.map`-copied (no shared
    references). No bugs found.
  - **Reusable primitives extracted** to `wizard/shared.tsx`:
    1. `LOCKED_INPUT_CLASSES` constant + `fieldInputClass(locked)`
       helper — replaces the 7-class Tailwind chain that was
       repeated in 3 files (PartiesStep co-entity inputs,
       SectionCustomNoteCard textarea, ModedNumericField).
    2. `makeContractSummaryUpdater` / `makeValueModeUpdater` /
       `makeSectionUpdater` factory helpers — collapse the
       6-line update closure repeated in 6 wizard files.
    3. `ToggleCheckbox` primitive — replaces the 8+ inline
       `<label className="inline-flex …"><input type=checkbox …`
       boilerplate snippets. Supports `disabled` for the
       Settlement Fee toggle that is gated by the parent
       Settlement-Included flag.
  - **Decomposition deferred** with rationale:
    - `wizard/shared.tsx` (~500 lines) — split into
      `shared/{routing,components,helpers}.ts` would change
      import paths in many files for moderate gain. Defer to
      next refactor cycle.
    - `PayinStep.tsx` (~410 lines) — `PayinRegionEditor` is
      ~260 lines and self-contained; extract into
      `steps/payin/PayinRegionEditor.tsx` next time.
    - `pdf-kit/styles.ts` (~700 lines) — single CSS-in-string
      blob with clear sectional comments; splitting adds
      concat noise without DX win.
  - **Documentation refresh**:
    - `architecture.md` ASCII data-flow now reads
      "hidden iframe (Blob URL)" instead of "popup window".
    - `pdf_rendering_logic_matrix.md` re-dated 2026-05-07; new
      §3.1 colour-scheme table, §3.2 N/A-toggle render rules,
      §3.3 region-label note. Renderer-gap callouts in §4.6 +
      §4.10 marked as **Closed** (custom notes + custom blocks
      + per-fee N/A toggles + ModedNumericField). §8 module
      mapping refreshed with `tierColor.ts`,
      `printHtmlViaIframe.ts`, the `<table class="page-layout">`
      wrapper, and the actual `agreementPdf/` file layout.
    - `agreement_structure.md` — file-tree updated to reflect
      the actual single-file `sections.ts` (the earlier
      proposed `sections/<name>.ts` split was not adopted).
    - `spec_v2_alignment.md` — re-dated 2026-05-07; new top-of-
      file callout listing all 2026-05-07 wizard + PDF
      additions.
- Alternatives considered:
  - Splitting `shared.tsx` immediately. Rejected for this pass —
    high import churn, low immediate ROI.
  - Extracting `PayinRegionEditor`. Same reasoning — defer.
- Consequences:
  - 220/220 tests still pass; behaviour-preserving refactor.
  - `OtherFeesStep.tsx` shrunk from ~229 → 203 lines via
    `ToggleCheckbox` adoption.
  - `wizard/shared.tsx` grew from 419 → ~500 lines because the
    new helpers live there; net codebase size dropped because
    the call-sites collapsed.
  - Documentation now matches the code. The "Renderer gap"
    callouts in `pdf_rendering_logic_matrix.md` no longer lie.
- Follow-up actions:
  - Next refactor cycle: extract `PayinRegionEditor` and split
    `wizard/shared.tsx` into focused modules behind a barrel.
  - Address the build's 501 KB single-chunk size (just over the
    Vite warning) when chunk-splitting becomes worthwhile.

### Decision: Auto-compact mode for OFFER sections
- Date: 2026-05-08
- Context:
  - With tiered + both-regions Card Acquiring (6 data rows), the
    section was tall enough to push subsequent sections onto a
    second page even when there was room overall. We needed a
    way to compress tall sections without changing the content
    or asking the user to opt in.
  - Approach driven from the worst-case fill: design a single
    "compact" preset calibrated to fit the maximum-data scenario
    of each section, then auto-apply it whenever a section is
    near worst case.
- Decision:
  - **Compact preset** lives in `pdf-kit/styles.ts` under
    `.offer-section.compact`. It tightens padding, drops
    th/td/cell-line/section-header/terms-item/fee-card font
    sizes by 1-2 pt, and slims line-heights. ~20% vertical
    saving with no content change. Standard colour rules
    (`accent-text`, `tier-color-*`, `value-na`,
    `cell-subtitle`) are unaffected.
  - **Auto-detect** at render time per section:
    - `offerPdf/sections/payin.ts`: compact when
      `totalRows >= 4` (tiered + both regions = 6, tiered + one
      region = 3) **or** `totalRows >= 2 && hasCustomNote`.
    - `offerPdf/sections/payout.ts`: compact when
      `showTierColumn` (3 tiered rows) **or** `hasCustomNote`.
    - `offerPdf/sections/terms.ts`: compact when
      `items.length >= 8` (worst case ~10 built-ins + custom
      blocks).
    - `offerPdf/sections/fees.ts`: never auto-compact (cards
      are already efficient at 3 per row).
  - **No user-facing toggle.** The decision is data-driven, the
    user never has to think about it.
- Alternatives considered:
  - Manual "Compact tables" wizard checkbox. Rejected — adds
    cognitive load and the user has to discover when to use it.
  - JS-measure-then-class on iframe load. Rejected — async
    behaviour, harder to test, harder to keep parity with
    Puppeteer-prod.
  - Always-compact in `@media print`. Rejected — would shrink
    even small offers, hurting readability for the common case.
- Consequences:
  - 226/226 tests pass (+6 covering: tiered+both → compact,
    single → no compact, tiered+one+note → compact, payout
    tiered → compact, payout single → no compact, terms with
    custom blocks → compact).
  - The OFFER PDF now self-adjusts: small offers stay
    spacious; busy offers compress just enough to keep section
    1 + section 2 on the same page where possible.
  - Behaviour is deterministic — same payload always produces
    the same compact decision.
- Follow-up actions:
  - Watch real generated PDFs. If a configuration still spills
    pages, adjust thresholds before reaching for any further
    structural changes (custom-note pre-wrap line counts,
    additional fee cards, MSA appendix start position).

### Decision: Per-page footer via per-section <tr> + page-1 header trim
- Date: 2026-05-08
- Context:
  - The per-page disclaimer footer (lives in the page-layout
    table's <tfoot>) was disappearing on every page except the
    last one, especially when a section custom note was very
    long. Two findings drove the fix:
    1. Chrome's <tfoot> repeat-per-page behaviour is reliable
       only when the <tbody> contains multiple <tr> elements —
       the engine uses <tr> boundaries as natural break points.
       Wrapping the entire document in a single <tr><td> meant
       Chrome rendered <tfoot> only at the end of the table.
    2. Even with multiple TRs, a section that included its
       custom note in the same row could overflow that single
       row to a second page; the forced row break still
       occasionally suppressed the per-page footer.
  - Separately, page 1 needed extra vertical room so the
    "header + first table + custom note + per-page footer"
    requirement was always met. The 2026-05-08 trim was driven
    by direct measurement against the worst-case full PDF.
- Decision:
  - **Multiple <tr> rows in <tbody>**. `buildOfferPdfHtml`
    now wraps each top-level block (header, every OFFER section,
    agreement body, each custom note) in its own
    `<tr><td class="page-content-cell">…</td></tr>`. Chrome's
    print engine sees natural break points and reliably repeats
    `<tfoot>` on every page. Implemented via `wrap()` helper +
    `buildOfferBodyRows()` returning `string[]` instead of one
    concatenated string.
  - **Custom notes are siblings, not descendants of sections**.
    `buildPayinSection` / `buildPayoutSection` no longer emit
    the custom note. Two new exports —
    `buildPayinCustomNoteHtml(data)` and
    `buildPayoutCustomNoteHtml(data)` — return the standalone
    `<p class="section-custom-note">…</p>`. The orchestrator
    pushes them as separate rows. Even a 200-line note can flow
    across pages without dragging the section's avoid-break
    rule.
  - **`hasPayinCustomNote(data)` / `hasPayoutCustomNote(data)`
    helpers** — the boolean drives both the auto-compact
    heuristic in the section builder and the renderer in the
    note-html builder, so the predicate has a single source of
    truth.
  - **Defensive explicit display rules** on the page-layout
    table parts (`thead → table-header-group`, `tbody →
    table-row-group`, `tfoot → table-footer-group`). These are
    the defaults but stating them protects against future CSS
    cascades that could clobber them.
  - **Page-1 header / table trim**. Calibrated against worst-
    case payload (tiered + both regions + custom note) so the
    page-1 budget always covers header + section 1 + 5+ lines
    of note + per-page footer. Specific changes:
    - `offer-title` 36pt → 30pt; margin-top 8 → 6
    - `offer-top-line` height 6 → 4; margin-bottom 14 → 8
    - `offer-header` padding-bottom 12 → 6
    - `offer-subtitle` margin-top 10 → 6
    - `meta-item` padding 5 → 4 (vertical); min-height 56 → 44 → 38
    - `meta-value` 11pt → 10pt; line-height 1.25 → 1.2
    - `meta-grid` margin-top 14 → 8
    - `meta-note` margin-top 10 → 6; padding 6 → 4; line-height 1.4 → 1.35
    - `offer-section` margin-top 20 → 14
    - `compact th/td` padding 3 → 2 (vertical); line-height 1.2 → 1.15
    - `compact .cell-line` line-height 1.18 → 1.12
- Alternatives considered:
  - **`position: fixed; bottom: 0`** for the footer plus a
    large `@page { margin-bottom }`. Rejected — earlier
    iteration showed Chrome lets fixed elements overlap content
    even when @page margin reserves space.
  - **CSS `position: running()`** with `@bottom-center` margin
    box. Rejected — Chrome support is partial; Firefox-only
    feature for the multi-line disclaimer.
  - **Manual "compact tables" toggle in the wizard**. Rejected
    — adds cognitive load. The data-driven heuristic is
    deterministic and predictable.
- Consequences:
  - 226/226 tests pass. The structural change is internal HTML
    wrapping; existing assertions check class / text presence
    and were unaffected.
  - The OFFER PDF now reliably renders the per-page disclaimer
    footer on every page in Chrome (and Puppeteer in Phase 8).
  - Even a multi-page-tall custom note no longer hides the
    footer on intermediate pages.
  - Page-1 budget now fits 5+ lines of section custom note
    alongside a worst-case Card Acquiring (6 tiered rows + both
    regions) — verified against the 2026-05-08 stress-test PDF
    set ("test test test…").
- Follow-up actions:
  - In the Phase 8 Puppeteer pipeline, prefer
    `displayHeaderFooter: true` with `headerTemplate` /
    `footerTemplate`. The HTML <tfoot> structure stays as a
    fallback for the frontend preview path.
  - If users start typing genuinely huge custom notes (10+
    lines), revisit page-1 strategy — at some point the note
    must overflow, and we may want a wizard hint about line
    count budget.

### Decision: Relax compact preset + heavy-section page-break rule
- Date: 2026-05-08 (second pass)
- Context:
  - The compact preset and page-1 trim from the first 2026-05-08
    pass got the per-page footer working and made everything fit,
    but the result felt over-compressed — rows looked cramped and
    the meta-grid lost too much breathing room. Product wants:
    - Tiered payin (6 rows, both regions): page 1 holds *only*
      the header + section 1 + payin custom note; section 2 lands
      on page 2.
    - Non-tiered payin (compact natural section): page 1 holds
      sections 1 + 2 (+ their notes); sections 3 + 4 land on page 2.
- Decision:
  - **Compact preset relaxed**:
    - `.compact th/td` padding 2x6 → 3x7; font 8pt → 8.5pt;
      line-height 1.15 → 1.22
    - `.compact th` font 6.5pt → 7pt
    - `.compact .cell-line` line-height 1.12 → 1.2
  - **Header / meta relaxed**:
    - `.offer-title` 30pt → 32pt
    - `.meta-item` padding 4x9 → 5x9; min-height 38 → 42
    - `.meta-note` margin-top 6 → 8; padding 4 → 5; line-height
      1.35 → 1.4
    - `.offer-section` margin-top 14 → 16
  - **Forced page break for heavy payin**: orchestrator emits
    the `force-page-break-before` class on the `<tr>` that holds
    the Pay Out section when
    `layout.payin.tableMode === "byRegionTiered"` (the only "6
    rows" case). Light payin → no extra break, sections 1 + 2
    share page 1 naturally.
  - `buildOfferBodyRows` return type changed from `string[]` to
    `OfferBodyRow[]` (`{ html, breakBefore? }`) so the
    orchestrator can mark individual rows for forced breaks
    without leaking the rule into per-section builders.
- Alternatives considered:
  - Force the break on the payin **custom note** TR instead of
    the payout TR. Rejected — break-after on the last "page 1"
    element is less reliable than break-before on the first
    "page 2" element across browsers.
  - Detect payin heaviness inside the section builder and emit
    the break-before from there. Rejected — that couples a
    layout (multi-row inter-section) concern into the per-
    section renderer.
- Consequences:
  - Compact tables still ~15% tighter than default but no longer
    feel airless. Meta grid breathes again.
  - 228/228 tests pass (+2 covering both heavy-payin and
    light-payin paths).
  - Tiered offer reads cleanly: page 1 ends with section 1 +
    note; page 2 starts with section 2.
  - Non-tiered offer keeps sections 1 + 2 on page 1 as before.
- Follow-up actions:
  - If product adds a 5th section in the future, consider
    promoting the page-break rule into a small policy module so
    new sections can opt in.

### Decision: Extend forced page break to non-tiered payin too
- Date: 2026-05-12
- Context:
  - The first cut of the page-budget rule (2026-05-08) only
    forced a page break before Pay Out when payin was heavy
    (`byRegionTiered`). For non-tiered payin (light), nothing
    forced a break, so page 1 ended up holding sections 1 + 2 + 3
    when there was room — leaving section 4 alone on page 2.
  - Product wants the symmetric rule: when payin has no tiers,
    page 1 = sections 1 + 2 + their notes and page 2 = sections
    3 + 4. Sections 3 + 4 always share a dedicated page.
- Decision:
  - Forced page break now fires in two cases:
    1. `heavyPayin` (tiered: `byRegionTiered` or `flatTiered`) →
       force break before **Pay Out**. Page 1 = section 1 + payin
       note. Page 2 = sections 2 + 3 + 4.
    2. `lightPayin` (non-tiered: `byRegionFlat` or `flatSingle`) →
       force break before **Other Services & Fees**. Page 1 =
       sections 1 + 2 + their notes. Page 2 = sections 3 + 4.
  - When payin is absent (`!payin`), neither flag fires and the
    document flows naturally — there's no "section 1" anchor for
    the page-budget rule.
- Alternatives considered:
  - Always force break before Other Services & Fees regardless
    of payin. Rejected — would push section 3 to page 2 even
    when section 1 is heavy enough to fill page 1 on its own,
    creating awkward page 2 layouts (just section 2, then
    section 3 alone, then section 4 alone across multiple
    pages).
  - Force break inside heavy payin too. Rejected — section 1
    naturally fills the page; explicit break is unnecessary.
- Consequences:
  - 230/230 tests pass (+2 covering the light-payin force-break
    and the no-payin fallback).
  - Both tiered and non-tiered offers now produce predictable
    2-page layouts (3-page when bundled with the agreement).
  - The rule lives entirely in `buildOfferBodyRows` and reads as
    two booleans + two `breakBefore: …` flags — clear to follow.
- Follow-up actions:
  - Verify against real reference PDFs (CEI, ZenCreator) that
    the page break locations match the expected layouts.

### Decision: 2026-05-12 product update batch (A/B/C/D)
- Date: 2026-05-12
- Context:
  - Product circulated a 4-item update list ("Обновление.docx")
    covering label renames, a default change, and one new
    feature for EU Blended pricing. The user asked for each
    change to be self-contained and clearly documented so any
    of them can be reverted independently.
  - Calculator math is normally frozen (see AGENTS.md rule #1
    and `~/.claude/.../feedback_calculator_frozen.md`); the
    user explicitly approved Commit D's math change for this
    batch only.
- Decision: implement as four separate commits, each with a
  small revert path.

  **Commit A — Settlement default T+3** (`4ad02c3`).
    - Files: `src/domain/calculator/zone4/otherFeesAndLimits.ts`
      (`DEFAULT_CONTRACT_SUMMARY_SETTINGS.settlementPeriod`),
      `src/components/document-wizard/fromCalculator.test.ts`
      (fixture + 2 assertions).
    - Revert: switch the constant back to `"T+2"` and reset the
      three test-fixture lines that were bumped to `T+3`.

  **Commit B — "Client Type" → "Traffic Type" rename** (`bc7bb61`).
    - Label-only rename in the wizard step
      (`TermsLegalSection.tsx`), the offer PDF
      (`offerPdf/sections/terms.ts`), and the UI-kit preview
      (`buildPdfUiKitHtml.ts`).
    - Data key `clientType` is intentionally preserved on the
      payload so saved drafts stay compatible. Default value
      `"STD"` is unchanged.
    - Revert: swap the strings back to "Client Type" in those
      three files; no schema migration needed.

  **Commit C — "Over limit only" → "Under limit only" rename** (`21c9a31`).
    - Label-only rename in calculator Zone 4
      (`Zone4RevenueAffectingFees.tsx`), wizard
      (`OtherFeesStep.tsx`), PDF (`offerPdf/sections/fees.ts`,
      `domain/calculator/zone6/offerSummary.ts`), and one wizard
      test assertion.
    - The data key (`failedTrxMode: "overLimitOnly"`) and the
      underlying threshold semantics are unchanged. If product
      later wants the calculation to actually flip (charge only
      below the threshold instead of only above), the data key
      should be renamed at the same time so the label and the
      math stay consistent. Currently the label reads "Under" but
      the calculation still treats the threshold as the *upper*
      cap — this is documented in `calculator_deferred_changes.md`.
    - Revert: swap strings back; logic untouched.

  **Commit D — Dedicated Countries (EU Blended)** (commit `c6e71e4`).
    - New optional `dedicatedCountries` block on
      `PayinRegionPricingConfig` (and a mirror on the wizard
      payload). When enabled, EU scheme fees are split between
      the standard portion and a UK+CH portion charged at a
      fixed coefficient (`1.30%`).
    - When the field is absent or `enabled === false`, the math
      collapses to the original `volume × schemeFeesPercent`, so
      pre-existing payloads keep working. Verified with new
      regression tests in `zone3/pricingConfiguration.test.ts`
      and `zone5/profitability.test.ts`.
    - The `1.30%` value is exported as
      `DEFAULT_DEDICATED_COUNTRIES_COEFFICIENT_PERCENT` so any
      future product change is a single-line edit.
    - **Superseded same-day:** the original Commit D shipped this
      coefficient as a user-editable `coefficientPercent` field.
      Product asked to lock it to a constant a few hours later —
      see the "Lock Dedicated Countries coefficient to a constant"
      entry directly below this one. The description above
      reflects the *post-lock* state, which is what's on `main`.
    - Revert: remove `dedicatedCountries` from the config / input
      types, restore the original two-line `schemeFees` formula
      in `zone5/payin.ts` and the preview block in
      `zone3/pricingConfiguration.ts`, drop the UI block from
      `PayinRegionPricingPanel.tsx` and `PayinStep.tsx`, drop the
      setter from `useCalculatorState.ts`, and delete the
      `dedicatedCountries` cases in the test files.
- Alternatives considered:
  - Bundling all four into one commit. Rejected — the user asked
    for per-change documentation and reversibility.
  - Making the dedicated coefficient a hardcoded constant from the
    start. Initially rejected (product wanted it editable), then
    accepted same-day after product reviewed the UI — see the
    follow-up decision entry below.
- Consequences:
  - 238/238 tests pass (+8 covering dedicated-countries
    backward-compat + new behaviour).
  - Pre-2026-05-12 saved wizard drafts and serialized calculator
    states continue to load and compute identical numbers — the
    Dedicated Countries field is optional everywhere it appears.
  - The "Under limit only" label currently disagrees with the
    underlying logic; tracked as a follow-up.
- Follow-up actions:
  - Confirm with product whether Commit C's logic should flip
    (`Under limit only` should charge **below** the threshold).
    If yes, rename `failedTrxMode` to `underLimitOnly` and
    invert the comparison in the failed-trx revenue derivation
    in a separate commit.
  - Consider whether the WW panel ever needs the Dedicated
    Countries control. Today it's intentionally EU-only.

### Decision: Lock Dedicated Countries coefficient to a constant
- Date: 2026-05-12 (same day as Commit D)
- Context:
  - Commit D shipped the Dedicated Countries feature with the
    coefficient (default 1.30%) exposed as an editable
    `coefficientPercent` field in both the calculator panel and
    the wizard's PayinStep. Product reviewed the UI and asked to
    remove the input — the coefficient should always be 1.30% and
    live as a constant in the codebase.
- Decision:
  - Remove `coefficientPercent` from `DedicatedCountriesConfig`
    (`zone3/pricingConfiguration.ts`) and from the matching
    `PayinRegionProfitabilityInput.dedicatedCountries` shape
    (`zone5/types.ts`), the wizard payload (`document-wizard/types.ts`),
    and all related UI / setter signatures.
  - Math now reads
    `DEFAULT_DEDICATED_COUNTRIES_COEFFICIENT_PERCENT` directly in
    both the preview (`calculatePayinRegionPricingPreview`) and the
    profitability (`calculatePayinRegionProfitability`). The
    constant remains exported so any future change is a one-line
    update.
  - UI grid collapses from three columns (UK / CH / Coefficient)
    to two columns (UK / CH). The helper copy was updated to
    state explicitly that the dedicated portion is charged at a
    fixed 1.30%.
  - Tests updated to drop `coefficientPercent` from the fixtures.
    Asserted values are unchanged because the previous fixtures
    used 1.30 — i.e. the same value the constant carries.
- Alternatives considered:
  - Keep the editable field but hide the input. Rejected — leaves
    dead state in the payload, confusing for future readers and
    for serialized drafts.
  - Make the constant a hidden global override (env / config).
    Rejected — premature; ops asked for a hard-coded constant.
- Consequences:
  - 238/238 tests pass (no test count delta).
  - Pre-existing saved drafts that include `coefficientPercent`
    still deserialize: TS structural typing silently drops the
    extra field on assignment; the math uses the constant
    regardless of what value was saved.
  - One-place revert: re-add `coefficientPercent` to
    `DedicatedCountriesConfig` + `PayinRegionProfitabilityInput.dedicatedCountries`
    + the wizard payload type, restore the `NumberField` block in
    `PayinRegionPricingPanel.tsx` and `PayinStep.tsx`, and route
    it back through the math (replace the constant with
    `input.dedicatedCountries.coefficientPercent`).
- Follow-up actions:
  - None — the feature now matches product's "always 1.30%" spec.

### Decision: Centralised PDF spacing scale + relaxed compact preset
- Date: 2026-05-12 (same evening as Commit D / coefficient lock)
- Context:
  - Product printed a sample PDF and noted that the OFFER layout
    felt "squished" — gaps between numbered sections were too
    small, and the cards/items inside sections 3 (Other Services &
    Fees) and 4 (Terms & Limitations) had inconsistent paddings
    versus the document header meta-grid. Several near-identical
    padding values were hand-typed in different places, which made
    drift inevitable.
  - The compact preset (auto-applied to tall payin/payout/terms
    sections) was originally calibrated to keep room for a 6-line
    custom note alongside the heaviest layout. Product asked to
    target 3-4 lines instead, which gives the preset more vertical
    budget to spend on breathing room.
- Decision:
  - Introduce a small spacing scale at `:root` in
    `src/components/document-wizard/pdf-kit/styles.ts`:
    ```
    --space-section-gap: 22px;  /* gap between numbered sections   */
    --space-header-gap:  10px;  /* title → grid + custom-note top  */
    --space-grid-gap:    12px;  /* gap between cards in .fees-grid */
    --space-cell-y/x:    8/11;  /* .meta-item, .terms-item padding */
    --space-card-y/x:   10/12;  /* .fee-card padding               */
    ```
  - Rewire `.offer-section`, `.section-header`, `.fees-grid`,
    `.fee-card`, `.terms-item`, `.meta-item` and
    `.section-custom-note` to read from these variables. Each rule
    that previously had a magic-number padding now references the
    scale by name. `.meta-item` and `.terms-item` share the
    "small cell" pad (`8px 11px`) because both render a label +
    single-line value; `.fee-card` keeps the slightly larger
    "big-value card" pad (`10px 12px`) for its three-line content.
  - Recalibrate the compact preset:
    - `th/td` padding `3px 7px → 4px 8px`, font `8.5pt → 9pt`,
      line-height `1.22 → 1.25`.
    - `section-header h2` `12pt → 13pt`,
      `section-header margin-bottom` `4px → 7px`.
    - `terms-item` `4px 7px / 32px → 6px 9px / 36px`,
      `terms-value` `8.5pt → 9pt`.
    - `fee-card` `6px 8px / 56px → 8px 10px / 60px`,
      `fee-value` `12pt → 13pt`.
    - `section-custom-note` `7pt / 1.3 / margin-top 6px →
      7.5pt / 1.35 / 8px`.
- Alternatives considered:
  - Moving the spacing scale to the typed `PdfUiKitTokens` object
    in `pdf-kit/tokens.ts`. Rejected — it would force every call
    site that constructs tokens to know about the spacing keys,
    and the CSS-only approach keeps the scale visible in one
    place alongside the rules that use it.
  - Inlining the new values without naming them. Rejected — the
    whole point of this pass was to make matching paddings match.
- Consequences:
  - 238/238 tests pass — no behavioural change. The compact-mode
    HTML still carries the `<section class="offer-section compact">`
    wrapper and all activation heuristics in payin.ts / payout.ts
    / terms.ts are untouched.
  - The default OFFER PDF now reads with measurably more breathing
    room between sections, and matching cell types align visually.
  - Compact layouts (heavy payin / heavy terms) accept a 3-4 line
    custom note without truncation or page overflow; 6-line notes
    in compact mode are no longer supported as the default budget.
- Follow-up actions:
  - If product later asks to compress further (e.g. 5-line note in
    compact), the simplest revert is to lower the four `--space-*`
    values and tighten the compact overrides back toward the
    pre-2026-05-12 numbers preserved in git history.

### Decision: Scope Dedicated Countries to the calculator only
- Date: 2026-05-12 (same evening, after the spacing pass)
- Context:
  - Commit D shipped the Dedicated Countries (UK + Switzerland)
    feature as a mirrored block: a UI control in the calculator's
    EU Blended panel + a parallel UI block in the wizard's
    `PayinStep`, with the field propagated through the wizard
    payload (`PayinRegionPricing.dedicatedCountries`),
    `fromCalculator.ts`, and `seedHelpers.clonePayinRegionPricing`.
  - Product reviewed the wizard UI and asked to remove it: the
    feature affects the calculator's internal scheme-fee math
    (Zone 5 profitability) and intentionally never shows up in the
    OFFER PDF (no row added — see the earlier 2026-05-12 PDF scope
    decision under the same batch). Mirroring it into the wizard
    duplicated state without adding user value and risked future
    drift if either side changed independently.
- Decision:
  - Remove the field and UI from the wizard layer entirely:
    - `PayinRegionPricing.dedicatedCountries` deleted from
      `src/components/document-wizard/types.ts`.
    - `fromCalculator.ts` no longer propagates the field — the
      wizard payload's `payinPricing.eu` / `payinPricing.ww` blocks
      are now plain pricing config with N/A toggles only.
    - `seedHelpers.clonePayinRegionPricing` explicitly destructures
      `dedicatedCountries` out of the input before spreading the
      rest, so a calculator config carrying the field still passes
      through (TS-safely) but the wizard payload never gains it.
    - The Dedicated Countries UI block in `PayinStep.tsx`
      (checkbox + UK% + CH% inputs, region === "eu" + Blended only)
      is removed. A `/* NOTE */` comment replaces it so a future
      reader sees why the seemingly-obvious mirror is absent.
  - Calculator side stays unchanged:
    - `PayinRegionPricingConfig.dedicatedCountries` and
      `DEFAULT_DEDICATED_COUNTRIES_COEFFICIENT_PERCENT` live in
      `src/domain/calculator/zone3/pricingConfiguration.ts`.
    - Math (`resolveDedicatedCountriesShare`, preview + zone5
      profitability) is untouched.
    - UI control in `PayinRegionPricingPanel.tsx` (EU + Blended)
      remains the single editing surface.
- Alternatives considered:
  - Keep the wizard mirror as read-only. Rejected — still
    duplicates state and confuses ops about which surface is
    authoritative.
  - Surface the dedicated split in the OFFER PDF (extra row).
    Rejected earlier in the day (see prior conversation): PDF is
    merchant-facing pricing, dedicated split is internal cost
    accounting.
- Consequences:
  - 238/238 tests still pass — there were no wizard tests
    referencing `dedicatedCountries` (it was added at the same
    time as the rest, and removal is symmetric).
  - The Dedicated Countries feature now has one canonical surface
    (calculator Zone 3 EU panel) and one canonical math path
    (zone3 preview + zone5 profitability). Drift between wizard
    and calculator is structurally impossible because the wizard
    payload no longer carries the field at all.
  - Saved wizard drafts from earlier today that include a
    `dedicatedCountries` block deserialize cleanly — TS structural
    typing drops the now-unknown property on assignment and
    nothing downstream reads it.
- Revert path:
  - Restore `dedicatedCountries?: { enabled, ukPercent, chPercent }`
    on `PayinRegionPricing` (types.ts).
  - Re-add the propagation in `fromCalculator.ts` (both EU + WW
    blocks) and the explicit clone in
    `seedHelpers.clonePayinRegionPricing`.
  - Restore the UI block in `PayinStep.tsx` — git history at
    commit `e8007d8` has the post-coefficient-lock version.
- Follow-up actions:
  - None — feature now lives where product asked.

### Decision: Compact-preset table cells reverted to tight (pass-2 fix)
- Date: 2026-05-12 (same evening, after the wizard cleanup)
- Context:
  - Pass-1 of the compact preset recalibration (earlier today, see
    "Centralised PDF spacing scale + relaxed compact preset") moved
    every compact value ~10-15% closer to default to fix the
    "squished" look in sections 3 (fee cards) and 4 (terms grid).
  - Product tested with the worst-case payin layout (6 tiered rows
    × both regions = 7 row cells) plus a 3-line custom note. The
    note overflowed onto page 2 and the orchestrator's
    `force-page-break-before` on Pay Out then pushed everything
    else to page 3 — producing a 3-page document with the note
    alone on page 2 and ~85% of page 2 unused.
- Decision:
  - Revert ONLY the table-cell relaxations in the compact preset.
    Tables dominate the page-1 footprint at the worst case
    (7 rows × per-row height); cards and terms are smaller and
    did not contribute to the overflow. Keep cards / terms /
    custom-note in their pass-1 relaxed form.
  - Specifically:
    - `.offer-section.compact th/td` padding `4px 8px → 3px 7px`,
      font `9pt → 8.5pt`, line-height `1.25 → 1.22`.
    - `.offer-section.compact th` font `7.25pt → 7pt`.
    - `.offer-section.compact .cell-line` line-height `1.22 → 1.2`.
    - `.offer-section.compact .section-header` margin-bottom
      `7px → 5px` (mid-point between original tight 4px and
      pass-1 relaxed 7px).
    - `.offer-section.compact .section-header h2` `13pt → 12pt`.
  - Add a small new override:
    - `.offer-section.compact { margin-top: 14px }` (default is
      22px from the spacing scale). Saves ~8px of inter-section
      gap when compact is active — invisible to the eye but
      meaningful for the page-1 budget.
  - Pass-1 relaxations preserved for: `.terms-item`,
    `.terms-label`, `.terms-value`, `.fee-card`, `.fee-value`,
    `.fee-card h3`, `.fee-subtitle`, `.section-custom-note`. The
    "squished" complaint these solved was in sections 3 and 4,
    which sit on page 2 in the heavy-payin layout (force-break)
    and don't share page-1 budget.
- Alternatives considered:
  - Universal relaxation (pass-1 only). Rejected — pushes the
    note off page 1 for the worst-case layout.
  - Lower compact-activation threshold so the 6-row case gets an
    even tighter preset. Rejected — adds preset variants and
    complicates `payin.ts` / `payout.ts` / `terms.ts` activation
    heuristics.
  - Tighter custom-note typography. Rejected — note text needs to
    remain readable; the savings would be marginal.
- Consequences:
  - 6 tiered rows + 3-line custom note fits on page 1 again.
  - Sections 3 and 4 (and the section headers in compact mode)
    still have the breathing room from pass-1; nothing about
    those layouts changes.
  - 238/238 tests pass (no test asserts on specific compact
    padding/font values).
- Follow-up actions:
  - If product later raises the note target back toward 5-6 lines
    in compact, the cleanest path is to compress the header
    (title + meta-grid + meta-note) rather than further squeeze
    the table cells, which are already at their original tight
    calibration.

### Decision: Phase 8 backend planning v2.0 finalised
- Date: 2026-05-12 (planning session, after frontend freeze)
- Context:
  - Phase 8 plan v1 (2026-05-03) was authored before the
    2026-05-12 product-update batch + pre-Phase-8 audit + the
    architect's decomposition recommendations. Several v1 design
    choices were superseded by the audit findings and new product
    decisions (unified `documents` table, server-side PDF render,
    no public links, HubSpot-only client source, etc.).
  - The product team also raised four new UI requirements during
    the audit conversation: documents listing page with filters,
    shareable view-mode links (logged-in only), clone-as-new-draft,
    and HubSpot status tracking in listings.
- Decision:
  - Archive v1 plan as `phase_08_backend_plan_v1_archived.md` and
    write a fully consolidated v2.0 at `phase_08_backend_plan.md`.
  - V2.0 captures every decision from the 2026-05-12 planning Q&A
    (numbered 1-20 in the plan's §16 decision log). Highlights:
    1. Single Docker container on Linux VPS (was: two containers).
    2. One auth role; admin creates users via script; no
       self-signup, no password reset.
    3. All URLs logged-in only; no public share tokens.
    4. Document numbering: `BSG-<7d_monotonic>-<6d_hubspot_id>`,
       start at `7100001`, no reset (was: `BSG-#####`).
    5. Statuses: `draft → confirmed` only. Each row has a unique
       number; clone = new row. No parent/superseded/archived.
    6. Document types: `calculator_snapshot | offer | agreement`
       in ONE unified `documents` table (was: separate
       `calculator_snapshots` table + separate document types).
    7. Latest "current" rendering: per `(company, document_type)`
       so each company can simultaneously have a current offer
       and a current agreement.
    8. PDF render: server-side Puppeteer + Chrome in the same
       container. Reuses existing `buildOfferPdfHtml`. Pixel-diff
       CI gate against 10 baseline fixtures.
    9. PDF binary NOT stored; rendered on-demand.
    10. No email/notifications, no audit log, no automated
        backups, no monitoring in Phase 8 MVP (all deferred to
        Phase 8.1 hardening).
    11. Wizard explicit "Save" — no per-keystroke autosave.
    12. HubSpot data flows IN to our DB only (read sync via
        "Refresh" button); we never write back in Phase 8.
        Schema reserves nullable `hubspot_*` columns. Field
        mapping deferred until API access available.
  - Companion docs written today and integrated by the plan:
    - `docs/backend_state_schemas.md` — Zod-ready type contracts.
    - `docs/backend_computation_boundary.md` — recompute vs. trust.
    - `docs/client_and_hubspot_workflow.md` — Phase 8 vs Phase 9
      client/HubSpot mechanics.
    - `docs/ui_phase_8_9_requirements.md` — listing, view-mode,
      clone, HubSpot status UI specs.
- Alternatives considered:
  - Keep v1 and append a "2026-05-12 corrections" section.
    Rejected — too many corrections for a coherent read; a backend
    engineer walking in cold would have to mentally diff two
    halves of the doc.
  - Skip the consolidation, keep individual docs only. Rejected —
    the orchestration plan with sprint order + acceptance criteria
    + schema in one place is what backend kickoff needs.
- Consequences:
  - Single source of truth for Phase 8 implementation. Backend
    engineer reads `phase_08_backend_plan.md` end-to-end and knows
    what to implement, in what order, by which acceptance criteria.
  - V1 stays in the repo (archived) for traceability — readers can
    see what was originally planned vs. what changed.
  - 246/246 frontend tests still pass; all decomposition modules
    (`snapshotShape.ts`, `derivedSummaryShape.ts`,
    `wizard/layoutHelpers.ts`) wait for backend consumption.
- Follow-up actions:
  - Backend kickoff meeting: walk through the v2.0 plan §12
    (sprint plan).
  - Capture 10 PDF baseline fixtures BEFORE writing the Puppeteer
    endpoint — they're the safety net for "server render must
    match current browser render".
  - Update `docs/spec_v2_alignment.md` to flip Phase 8 rows from
    "spec finalised" to "implementation in progress" once Sprint 1
    starts.
  - Phase 9 planning (HubSpot API integration) will happen after
    Phase 8 ships. The schema groundwork is already in place.

### Decision: Custom Payin rows (wizard + PDF, ad-hoc table rows)
- Date: 2026-05-14
- Context:
  - Sales-team request: a way to add one-off rows to the Card
    Acquiring (Payin) PDF table that don't fit the standard EU /
    Global region split. Examples raised: "Russia bundle", "Crypto
    rails", LATAM-specific commercial offers.
  - Existing rows are tied to `payinPricing.eu` and
    `payinPricing.ww` from the calculator state — fixed shape. No
    way to add an extra row without changing the schema.
- Decision:
  - Add an optional `payinPricing.customRows?: PayinCustomRow[]`
    field to `DocumentTemplatePayload`. Each row has its own
    free-form REGION + CURRENCY, the standard pricing model /
    rate-mode / TRX fees / tier setup (reusing `PayinFeeBlock`),
    and a structured MIN. TRANSACTION FEE (threshold + fee + N/A
    toggle).
  - METHODS column intentionally **hardcoded** to the same default
    text as standard rows ("Credit / Debit - Visa, Mastercard" +
    "APM - Apple Pay, Google Pay"). Operator cannot override per
    row — confirmed product decision (Q1=A).
  - Tier coloring (`tier-color-1/2/3`) and ● bullet behave
    identically to standard rows. The rendered output uses the
    same cell layout and the same column visibility rules
    (`hasAnyPayinMinFee`, etc.).
  - New Wizard section "Custom Payin Rows" lives in Step 2
    between the standard region editors and the Payin Section
    Note. Empty by default; "+ Add custom row" creates a card.
  - Calculator state DOES NOT carry custom rows. `fromCalculator.ts`
    always seeds `customRows: []`. Feature is wizard-only.
  - `resolvePayinTableMode()` gained an optional 4th param that
    accepts the custom-rows array; a tiered custom row promotes
    the table to byRegionTiered (so MONTHLY VOLUME TIER column
    stays visible) even when standard rows are single. Existing
    call sites unchanged.
- Alternatives considered:
  - Per-row editable METHODS column. Rejected — adds UI complexity
    without a real use case today; consistent METHODS text reads
    cleaner.
  - Free-form text for MIN. TRX FEE. Rejected — structured fields
    keep the column format consistent with standard rows.
- Consequences:
  - 250/250 tests pass (+4 new): back-compat (undefined customRows),
    single-rate row append, tiered row × 3-line render + tier
    colors, tableMode promotion test.
  - Saved drafts from before 2026-05-14 deserialize cleanly — the
    new field is optional, renderer treats `undefined` as empty.
  - Calculator side untouched; no regressions in 200+ existing
    tests that depend on the calculator state shape.
- Known consideration — page-break with many rows:
  - Compact preset was calibrated for the worst-case 6 standard
    tiered rows + 3-4 line note on page 1.
  - Adding many custom rows (especially tiered) pushes total
    row count above 6. Beyond ~8 rows the section won't fit on
    page 1 and the document spreads to 3 pages with potentially
    awkward breaks. Documented as a known limitation; no force-
    page-break logic added yet. Will revisit if real production
    PDFs hit the threshold and look awkward.

### Decision: Card Acquiring column-width rebalance
- Date: 2026-05-14
- Context:
  - Operator reported that "Credit / Debit - Visa, Mastercard"
    and "APM - Apple Pay, Google Pay" were wrapping onto 3-4
    visual lines in compact preset PDFs because the METHODS
    column was too narrow at 25%. The intended layout is
    exactly two `.cell-line` elements per cell.
  - MIN. TRANSACTION FEE column ("≤Xm: €Y" / ">Xm: N/A") at 22%
    had spare horizontal room — short content, never wraps.
- Decision:
  - Reallocate 5% from MIN. TRX FEE to METHODS:
    - `.col-methods` 25% → 30%
    - `.col-minfee` 22% → 17%
  - All other column widths unchanged.
- Alternatives considered:
  - Shrink the METHODS font in compact preset further. Rejected
    — already 8.5pt which is at the lower bound of readability.
  - Force `white-space: nowrap` on the methods cell. Rejected —
    if any unexpected long brand list appears in the future,
    the cell would silently overflow horizontally.
- Consequences:
  - METHODS lines now fit on one line each (2-line cell as
    designed).
  - MIN. TRX FEE content tested at 17% — single-line per cell-line,
    no wraps.
  - CSS-only change, no logic touched; 250/250 tests still pass.

### Decision: APM label round-trip (no net change)
- Date: 2026-05-14
- Context:
  - User asked to rename "APM - Apple Pay, Google Pay" to
    "APM - Apple & Google pay" everywhere (commit 9de2533).
    A few minutes later, user reverted the request and asked
    to restore the original label (commit e7ac0e7).
- Decision:
  - Label text returned to "APM - Apple Pay, Google Pay" in
    all three files (renderer const, UI-kit reference page,
    test assertion).
  - The column-width rebalance (above entry) STAYS — the longer
    label still fits on a single line thanks to the wider
    `.col-methods`, so no width revert.
- Consequences:
  - Net behaviour identical to pre-9de2533 with one improvement:
    the methods cell renders 2 lines as designed instead of
    wrapping.
- Follow-up actions:
  - None. If product wants a different APM label later, change
    the `apmLabel` const in `offerPdf/sections/payin.ts` — it's
    the single source of truth for the rendered text.

### Decision: Split Custom Payin Rows into separate section 1.1
- Date: 2026-05-14 (same evening)
- Context:
  - The first implementation of Custom Payin Rows (commit 95ba2ce)
    appended rows to section 1's table. That made page-break
    handling fragile — adding tiered custom rows pushed section 1
    beyond its 6-row worst-case calibration and risked mid-table
    breaks, asymmetric page layouts, and squeezed-out custom notes.
  - Product feedback: "make Custom Payin Rows their own table in
    the PDF (section 1.1) so they can be force-page-break'd onto
    page 2 when section 1 is heavy, and stay alongside section 1
    when it's light."
- Decision:
  - PDF: custom rows now render in their own `<section class="offer-section">`
    titled "1.1 Additional Card Acquiring — Credit / Debit Cards,
    APM & E-wallet". Same column widths, same `tier-color-*`
    classes, same `MIN. TRX FEE` rendering — visually a sibling
    of section 1, NOT an extension of it.
  - Wizard: the `PayinCustomRowsEditor` UI block moved from
    BEFORE the Payin Section Note to AFTER it. The intent is
    that operators first set up the standard regions + note,
    then optionally tack on ad-hoc rows.
  - Page-break orchestration: `buildOfferBodyRows` now emits
    section 1.1 as a separate row with `breakBefore: heavyPayin`.
    - Heavy payin (tiered): section 1 alone on page 1; section 1.1
      lands on page 2 alongside section 2 + sections 3 + 4.
    - Light payin (single rates): section 1.1 flows naturally on
      page 1 right after section 1 + payin note. Existing light-
      payin force-break before section 3 stays in place.
  - `renderSectionHeader` signature widened: `index: number` →
    `number | string` so the "1.1" string fits. `.section-index`
    CSS swapped fixed `width: 22px` for `min-width: 22px` +
    `padding: 0 6px` so single-digit indices stay square while
    "1.1" expands to fit.
  - `resolvePayinTableMode` reverted to its 3-param signature —
    custom rows live in their own section and no longer influence
    section 1's tableMode. Cleaner separation.
  - Custom rows still use the same `PayinCustomRow` type shape
    introduced in 95ba2ce. No schema migration required.
- Alternatives considered:
  - Stick with one big table + add force-page-break inside section 1.
    Rejected — `page-break-inside: avoid` is a soft hint;
    Chrome may still break mid-table on overflow, producing
    awkward visual layouts.
  - Tighter compact preset for section 1 when custom rows present.
    Rejected — sacrifices readability without solving the
    fundamental "section 1 grew beyond its calibration" issue.
- Consequences:
  - 251/251 tests pass (+1 new compared to previous round). The
    5 custom-row tests now assert section 1.1 separation, the
    "1.1" index badge, and the orchestrator's heavy/light
    breakBefore semantics.
  - Section 1 stays within its calibrated 6-row + 3-4 line note
    budget regardless of how many custom rows operators add.
  - The known limitation "many custom rows extend the doc to 3
    pages" from the 2026-05-14 entry above is no longer a real
    risk on heavy payin (1.1 is on page 2 with section 2,
    naturally splitting if needed) — still possible on extreme
    light-payin + many custom rows, but that's the path of least
    resistance and Chrome handles it gracefully now that 1.1 is
    its own bounded section.
- Follow-up actions:
  - None. The architecture is stable.

### Decision: Section 1.1 audit cleanup + screen-view badge bug fix
- Date: 2026-05-14 (immediately after the split-into-1.1 refactor)
- Context:
  - Operator reported the "1.1" section badge was visually clipped
    in the wizard's screen preview — rendered as a thin vertical
    bar instead of "1.1" text. Root cause: `.section-index` in the
    `@media screen` block of `pdf-kit/styles.ts` used `width: 32px`
    (fixed). Single-digit indices fit; "1.1" at `font-size: 30px`
    needed ~36-40px and was overflow-hidden by the fixed dimension.
  - An independent code review of the Section 1.1 refactor flagged
    additional cleanups: unused variables, an unnecessary defensive
    deep clone in render, duplicated `methodLabel` / `apmLabel`
    string literals across the two row builders, and a missing
    test scenarios.
- Decision:
  - **Screen-view bug fix**: `.section-index` in the screen media
    query now uses `min-width: 32px` + `padding: 0 8px`, matching
    the pattern from the print rule. Single-digit indices stay
    square; "1.1" expands to fit.
  - **Audit cleanup**:
    - Removed unused `isTiered` local in `PayinCustomRowCard`
      (`PayinStep.tsx:319` before patch).
    - Removed the defensive `customRows.map(clonePayinCustomRow)`
      call in `PayinCustomRowsEditor`'s render. `PayinCustomRowCard`
      is a pure-read component; all updates already pass through
      `updateCustomRows` which produces brand-new arrays via
      `.map`/`.filter`. The clone was dead protection at the cost
      of an O(n) deep copy per render + a confusing precedent that
      children mutate props.
    - Promoted the duplicated METHODS / APM column-label string
      literals to module-level constants `PAYIN_METHOD_LABEL` /
      `PAYIN_APM_LABEL` at the top of `payin.ts`. Both
      `buildPayinRows` (section 1) and `buildPayinAdditionalRows`
      (section 1.1) now reference the same const — a future label
      change is a one-line edit instead of two parallel literals.
    - Added a module-level `TIER_INDICES = [0, 1, 2] as const`
      tuple. Both `buildPayinRows` and `buildPayinAdditionalRows`
      now iterate via `TIER_INDICES.forEach(index => ...)`,
      eliminating the `index as 0 | 1 | 2` casts on `.forEach`'s
      number-typed index parameter.
    - `buildPayinAdditionalRows` and `hasAnyCustomRowMinFee` now
      take `customRows: ReadonlyArray<PayinCustomRow>` directly
      instead of drilling through `data.payinPricing.customRows`.
      Caller already holds the array — no need for a second
      `?? []` coalesce. Functions are independently unit-testable
      and easier to reason about.
    - Added an explanatory comment to the compact-heuristic
      difference between section 1 and section 1.1 (section 1
      uses a secondary "rows ≥ 2 && has note" trigger; section 1.1
      only uses the primary "rows ≥ 4" trigger because the note
      lives between sections 1 and 1.1, not below 1.1).
  - **Test additions** (3 new scenarios in
    `fromCalculator.test.ts`):
    - Explicit empty `customRows = []` (mirrors the `undefined`
      back-compat test; guards against the early-exit guard being
      reordered with the coalesce).
    - All-zero MIN. TRX FEE inputs (`threshold = 0`, `fee = 0`,
      `rowNa = false`) → MIN. TRANSACTION FEE column hidden in
      section 1.1's `<thead>`.
    - REGION + CURRENCY with HTML-injection characters
      (`<script>alert(1)</script>` / `EUR<"&>`) → renderer escapes
      via `escapeHtml`, raw tag never appears in output.
- Alternatives considered:
  - Full decomposition: extract a shared `<PayinPricingFieldsEditor>`
    React component covering the common model/rateMode/trx/tier UI
    AND a shared `renderPayinDataRow` HTML helper covering both
    standard and custom row HTML output. Reviewed by the audit and
    rejected on cost/benefit grounds:
    - React layer: prop-shape and update-plumbing differences would
      require threading 4-5 extra callbacks through a generic
      component to save ~60 LOC of UI duplication. Single-file
      sibling components are easier to read than a generic shared
      one for the current team size. Revisit only if a third
      sibling appears.
    - PDF layer: column-visibility logic differs (section 1 uses
      a layout-enum derivation, section 1.1 uses per-row `.some()`).
      Merging would need 4-5 flag parameters and produce a less
      readable function than the current slight repetition. The two
      builders are likely to diverge further as the custom-rows
      feature evolves.
- Consequences:
  - Bug fix: "1.1" badge now renders correctly in screen preview.
  - 254/254 tests pass (+3 over the prior 251).
  - tsc clean (main + server). Vite build clean.
  - Code is measurably cleaner without sacrificing readability:
    no dead code, no duplicate magic strings, no spurious type
    casts, parameters take the minimum data they need.
- Follow-up actions:
  - None. Decomposition deferred per the cost/benefit analysis
    above. Revisit if a third row-type sibling appears or if the
    two row-builder functions converge in their column logic.

### Decision: Fix double page-break between section 1.1 and section 2
- Date: 2026-05-14
- Context:
  - User reported (with `test2.pdf` attached) a large empty gap
    between section 1.1 ("Additional Card Acquiring") and section 2
    ("Pay Out") on heavy-payin documents. Section 1.1 was rendering
    alone on page 2 and section 2 was pushed to page 3 with a near-
    blank page 2.
  - Root cause: in `buildOfferBodyRows()` (`buildOfferPdfHtml.ts`)
    both the section 1.1 row AND the section 2 row carried
    `breakBefore: heavyPayin`. The orchestrator wraps any row whose
    `breakBefore` is true in `<tr class="force-page-break-before">`,
    and CSS applies `page-break-before: always`. With BOTH rows
    forced, the browser fired the page break twice:
      - first break: end of page 1 → section 1.1 opens page 2
      - second break: end of page 2 → section 2 opens page 3
    Page 2 therefore contained only section 1.1, leaving the rest
    of the budget unused.
  - The original `heavyPayin → break before Pay Out` rule (pre-1.1)
    was correct when section 1.1 did not exist: in that case section
    2 was the FIRST thing after the heavy section 1, so it needed
    its own break. Adding section 1.1 made the section-2 break
    redundant whenever 1.1 was present.
- Decision:
  - Section 2's `breakBefore` becomes conditional on the absence of
    section 1.1:
      breakBefore: heavyPayin && !hasAdditional
    where `hasAdditional = payinAdditional.length > 0` (the section
    1.1 builder returns `""` when there are no custom rows).
  - Section 1.1's `breakBefore` rule is unchanged
    (`breakBefore: heavyPayin`) — it remains the page-2 opener on
    heavy-payin documents that carry custom rows.
  - Net result is a single force-break per heavy-payin document
    regardless of whether section 1.1 is present:
      heavy + no 1.1   → break before section 2 (unchanged)
      heavy + has 1.1  → break before section 1.1, section 2 flows
                         naturally after it (NEW)
      light + any      → no break in the payin half (unchanged)
- Alternatives considered:
  - Drop the section-2 break entirely and rely on Chrome's natural
    break behaviour: rejected because in the heavy-no-1.1 case the
    payin custom note often leaves enough budget that section 2
    would partially fit on page 1 with the table wrapping awkwardly
    across the page boundary. The forced break preserves the
    "section 2 starts a fresh page when section 1 is heavy" rule.
  - Move section 1.1's break to section 2 unconditionally: rejected
    because section 1.1's own height varies wildly (8mm single row
    → ~50mm tiered row); without a forced break it sometimes
    straddled the page-1/page-2 boundary on edge cases.
  - Add an explicit `keep-together` rule via CSS `page-break-inside:
    avoid`: rejected because Chrome's support for cross-tbody-row
    page-break-inside is unreliable (the very reason every block is
    wrapped in its own `<tr>` in the first place).
- Consequences:
  - Heavy-payin documents with section 1.1 now use page 2 fully
    (section 1.1 + section 2 + payout note), and sections 3+4 either
    fit on the same page or naturally flow to page 3.
  - All 256/256 tests pass (+2 new regression tests):
      - HEAVY + 1.1   → asserts Pay Out's wrapping TR is plain
        (no `force-page-break-before`); section 1.1's TR still has
        the class.
      - HEAVY + no 1.1 → asserts Pay Out's wrapping TR DOES have
        `force-page-break-before` (guards against the new condition
        being over-applied).
  - `tsc --noEmit` clean. `vite build` clean.
  - Doc comment on `buildOfferBodyRows()` rewritten to document the
    three sub-cases (heavy+no-1.1, heavy+1.1, light) explicitly so
    future editors do not reintroduce the double-break.
- Follow-up actions:
  - None. The new rule is fully covered by tests; the comment block
    documents the rationale for future readers.

### Decision: Fix light-payin page-2 gap when section 1.1 is present
- Date: 2026-05-14
- Context:
  - User reported (with `last2.pdf` attached) the SAME symptom we
    just fixed for the heavy-payin case, but on the page 2 / page 3
    boundary: page 2 contained only section 2 with a huge empty
    space, and sections 3+4 were pushed to page 3.
  - Reproduction layout: section 1 light (flat, 2 rows) + custom
    payin note + section 1.1 tiered (3 rows) + section 2 tiered
    (3 rows) + section 3 (refund + dispute) + section 4 (8 terms).
  - Root cause: section 3 was carrying `breakBefore: lightPayin`
    (a pre-1.1 rule), so on light-payin documents section 3 was
    always force-broken to page 2. With section 1.1 added, page 1's
    budget became:
      header (~90mm) + section 1 (~20mm) + note (~10mm)
        + section 1.1 tiered (~50mm) ≈ 170mm
    leaving ~57mm for section 2 (~30mm) — section 2 sometimes fits,
    sometimes cascades to page 2 depending on edge cases. When it
    cascades, section 3's forced break leaves section 2 alone on
    page 2 with sections 3+4 on page 3.
  - The pre-1.1 design assumption was that light-payin documents fit
    `header + 1 + note + 2 + note` on page 1 comfortably, so we
    forced section 3 to page 2 to keep the layout clean. Adding 1.1
    invalidated that assumption.
- Decision:
  - Section 3's `breakBefore` becomes conditional on the absence of
    section 1.1, mirroring the section-2 fix:
      breakBefore: lightPayin && !hasAdditional
  - Net effect across all four sub-cases:
      heavy + no 1.1: section 2 forced to page 2; sections 3+4
                      flow after it. (Unchanged.)
      heavy + 1.1:    section 1.1 forced to page 2; sections 2/3/4
                      flow after it. (Fixed in prior decision.)
      light + no 1.1: section 3 forced to page 2; section 4 flows
                      after it. (Unchanged.)
      light + 1.1:    NO force-breaks. Section 1.1 naturally
                      cascades section 2 onto page 2 if needed;
                      sections 3+4 fill page 2 alongside section 2.
                      (Fixed in this decision.)
- Alternatives considered:
  - Always drop section 3's force-break unconditionally: rejected
    because the original light+no-1.1 case (header+1+note+2+note
    fits page 1 with room to spare) would otherwise put section 3
    near the bottom of page 1 with section 4 spilling — uglier than
    a clean page-2 separation. The conditional preserves the
    original layout for the most common case.
  - Force section 1.1 onto page 2 unconditionally (mirror the
    heavy rule): rejected because in light+1.1 documents,
    section 1.1 often fits page 1 alongside section 1, and forcing
    it down would create the symmetric "section 1 + note alone on
    page 1" gap. Let the browser decide whether 1.1 stays with 1.
  - Use CSS `page-break-inside: avoid` on section tables: rejected
    (same reason as the prior decision) — Chrome's support is
    unreliable across our `<tr>`-per-section orchestration.
- Consequences:
  - light + 1.1 documents (such as last2.pdf's repro) now use page 2
    fully: section 2 + payout note + section 3 + section 4.
  - All 258/258 tests pass (+2 new regression tests):
      - LIGHT + 1.1   → asserts Other Services & Fees DOES NOT have
        `force-page-break-before` on its wrapping TR.
      - LIGHT + no 1.1 → asserts Other Services & Fees DOES carry
        `force-page-break-before` (guards against the new condition
        being over-applied).
  - Doc comment on `buildOfferBodyRows()` rewritten to enumerate ALL
    FOUR sub-cases (heavy+no-1.1, heavy+1.1, light+no-1.1, light+1.1)
    so future editors see the complete decision tree.
  - The two fixes (section 2 and section 3) are symmetric: both gate
    the original force-break on `!hasAdditional`. This consistency
    makes the rule easier to remember and reason about.
- Follow-up actions:
  - None. The pair of fixes (section 2 + section 3) covers the
    cartesian product of {light, heavy} × {no 1.1, has 1.1} cleanly.
    Re-examine only if a fifth section is introduced.

### Decision: Section 1.1 inherits section 1's compact state (visual parity)
- Date: 2026-05-14
- Context:
  - User reported (with `workflo_base_fullstack.pdf` attached) that
    sections 1 and 1.1 — which are supposed to look IDENTICAL except
    for the index badge and the "Additional" prefix in the title —
    rendered with different row heights, header heights, and column
    wrapping. Specifically: "APM - Apple Pay, Google Pay" fit on one
    line in section 1 but wrapped to "APM - Apple Pay, Google" +
    "Pay" in section 1.1.
  - Root cause: the `.col-*` widths in `pdf-kit/styles.ts` are
    calibrated for the COMPACT preset's smaller font (8.5pt). The
    width comment explicitly says so:
      "Calibration 2026-05-14: bumped col-methods 25% → 30% ...
       so that 'Credit / Debit - Visa, Mastercard' and
       'APM - Apple Pay, Google Pay' each fit on a single line
       in the compact preset"
    Each section computed its own `isCompact` independently:
      Section 1:    totalRows >= 4 || (totalRows >= 2 && hasPayinCustomNote)
      Section 1.1:  totalRows >= 4  (own custom-row count only)
    In the repro: section 1 had 6 tiered rows (heavy + both regions)
    → compact, font 8.5pt → APM line fits 30%. Section 1.1 had 1
    tiered custom row = 3 PDF rows < 4 → NOT compact, font 9pt →
    APM line wraps. Two visually-identical sections rendered with
    different fonts because the column widths are font-size-sensitive
    and the two sections disagreed on the font.
- Decision:
  - Extract `resolvePayinCompact(data, layout)` in `payin.ts` as the
    SINGLE source of truth for both sections.
  - Section 1 keeps its existing rule (`>= 4 rows || >= 2 && note`).
  - Section 1.1 DROPS its own `>= 4 custom-rows` threshold and reads
    `resolvePayinCompact` directly — always matching section 1.
  - `buildPayinAdditionalSection` gains a `layout` parameter (was
    `(data)`, now `(data, layout)`); the call site in
    `buildOfferBodyRows` was updated accordingly.
- Alternatives considered:
  - Make section 1.1 ALWAYS compact: rejected because in the
    light-payin case (1 region, single rate) section 1 is non-compact
    (font 9pt), and we'd get the same mismatch with 1.1 forced to
    8.5pt. Strict inheritance covers both directions.
  - Keep section 1.1's own `>= 4` trigger AS WELL AS inheritance
    (logical OR): rejected because it can produce mismatches in the
    rare case where section 1 has 1-3 rows non-compact and section
    1.1 has many rows compact. User's instruction ("зроби однакові")
    means strict equality, not "compact if either has many rows".
  - Recalibrate `.col-methods` to fit "APM - Apple Pay, Google Pay"
    at the default 9pt font: rejected because section 1's compact
    layout is intentional (saves ~14px page-1 budget on heavy payin,
    fits the 6-row table + payin custom note in the page budget);
    widening METHODS at non-compact wouldn't fix the row-height /
    header-height differences and would change section 1's
    proportions in the compact case.
- Consequences:
  - Sections 1 and 1.1 now ALWAYS render with the same font, padding,
    line-height, header-height, and column-wrapping behavior.
  - The `.col-methods` width comment in styles.ts remains correct
    (calibrated for compact) — both sections now honor that
    calibration consistently.
  - All 259/259 tests pass (+1 new regression test):
      - "section 1.1 mirrors section 1's compact state (visual parity
        rule)" — covers two cases:
          a) heavy section 1 (compact) + 1 tiered custom row in 1.1
             → BOTH render `offer-section compact`.
          b) light section 1 (non-compact) + 1 single custom row in
             1.1 → BOTH render plain `offer-section`.
  - `tsc --noEmit` clean. `vite build` clean.
- Follow-up actions:
  - None. The parity rule is now enforced by a single function
    (`resolvePayinCompact`) and a single test. Any future change to
    section 1's compact heuristic automatically propagates to 1.1.

### Decision: Post-fix audit cleanup — test fixtures + redundant comment
- Date: 2026-05-14
- Context:
  - typescript-reviewer audit of commits e41261a / 75fc7bd / cd9c777
    surfaced two action items:
      1. Six tests in `fromCalculator.test.ts` constructed
         near-identical `PayinCustomRow` object literals inline (each
         ~20 LOC, only `id` / `region` / `currency` / `rateMode`
         differing). Pattern was already established for layout setup
         (`withBothRegions`); rows had no equivalent helper.
      2. The inline comment at `buildPayinSection`'s isCompact line
         was a summary of the block comment on `resolvePayinCompact`
         a few lines above — redundant given the helper's own docs.
  - Reviewer also confirmed: page-break orchestration in
    `buildOfferBodyRows` is at the threshold but still readable
    (would need a fifth section before extraction pays off);
    `resolvePayinCompact` is correctly placed in the section builder
    file (no cross-module coupling); `breakBefore` boolean coercion
    is type-safe (no `boolean | undefined` leaks).
- Decision:
  - Add two factory helpers next to `withBothRegions`:
      buildSingleCustomRow(overrides?: Partial<PayinCustomRow>)
      buildTieredCustomRow(overrides?: Partial<PayinCustomRow>)
    Both emit a "neutral" zeroed row by default and accept overrides
    for the few tests that care about specific numeric values.
    `buildTieredCustomRow` is implemented as a one-liner on top of
    `buildSingleCustomRow` (same shape, `rateMode: "tiered"` override).
  - Replace all six inline row constructions with helper calls.
  - Shorten the redundant `buildPayinSection` comment to a one-line
    pointer: `// Auto-compact preset: see resolvePayinCompact.`
- Alternatives considered:
  - Keep inline literals "for explicitness": rejected because the
    literals were ALREADY identical in shape — the duplication was
    obscuring intent, not exposing it. A test that names its fixture
    "buildSingleCustomRow" reads more directly than the same test
    inlining 20 lines of `{ trxCcNa: false, trxApmNa: false, … }`
    which has zero relevance to the assertions.
  - Make the helpers freeze the returned object: rejected because
    tests legitimately mutate the row (e.g. through overrides on the
    second helper invocation). The "neutral baseline + overrides"
    pattern handles this correctly without freezing.
- Consequences:
  - −69 net LOC in `fromCalculator.test.ts` (−118 / +49).
  - Test intent is clearer: each test now reads as
    "data.payinPricing.customRows = [ buildSingleCustomRow({ id: '…' }) ]"
    instead of a 20-line literal that buries the meaningful diff.
  - `payin.ts` loses one orphan comment block (−3 LOC). The
    `resolvePayinCompact` block comment (the one source of truth)
    is unchanged.
  - All 259/259 tests pass. `tsc --noEmit` clean. `vite build` clean.
- Follow-up actions:
  - None. The remaining inline row constructions (e.g. the
    HTML-injection test and the zero-fee column-hide test) keep
    their literal form because the test's assertions depend on the
    SPECIFIC values in those literals — a generic helper would hide
    the relevant context.

### Decision: Link-only HubSpot integration + Phase 8 field selection
- Date: 2026-05-14
- Context:
  - User confirmed a NEW HubSpot Private App token, allowing live
    inspection of the BSG production account. Two read-only scripts
    were added (`scripts/hubspot-one-company.ts`,
    `scripts/hubspot-merchant-and-deal.ts`) and used to validate
    real field-fill rates.
  - User clarified the integration model on 2026-05-14:
      "ми не будемо інтегрувати калькулятор і хабспот в прямому
       сенсі — ми будемо давати посилання на наш сервіс"
    Translated: we do NOT pre-fill the calculator from HubSpot deal
    pricing fields; HubSpot's role is identification + context, and
    we post a link back to our service after document confirm.
  - Live inspection confirmed earlier audit: every HubSpot deal
    pricing field (`forecasted_monthly_volume`, `transaction_fee__mdr`,
    `cost_per_transaction`, `setup_fee`, `chargeback_fee`,
    `switzerland_share_*`, `united_kingdom_share_*`, etc.) was NULL
    on the sampled deal. Sales team does not fill them. The
    link-only model makes that irrelevant.
- Decision:
  - **Sync trigger**: pull-on-demand. When the operator searches in
    the wizard, the backend hits HubSpot Search API for unknown
    records and upserts into our cache. No periodic cron in Phase 8.
  - **Refresh**: TTL-based (`HUBSPOT_SYNC_TTL_SECONDS`, default 300s).
    Stale row → background refetch driven by the next search hit.
  - **Companies — 8 extracted columns**:
      `hubspot_company_id`, `name`, `company_type`, `segment_type`,
      `lifecycle_stage`, `hs_task_label`, `hubspot_created_at`,
      `hubspot_modified_at`. Plus `hubspot_raw` JSONB.
  - **Deals — 12 extracted columns**:
      `hubspot_deal_id`, `hubspot_company_id` (FK), `name`, `stage`,
      `pipeline_id`, `amount`, `currency`, `client_label`,
      `agent_label`, `business_vertical`, `hubspot_created_at`,
      `hubspot_modified_at`. Plus `hubspot_raw` JSONB.
  - **Deal→Company link**: single FK on
    `hs_primary_associated_company`. HubSpot supports many-to-many
    associations but always maintains one "primary"; modeling as a
    single FK matches every BSG deal we've inspected.
  - **NO pricing-field extraction.** All deal pricing fields stay
    in `hubspot_raw` JSONB only. They are not used by the
    calculator and not displayed in any list view.
  - **Write-back model**: note + link after document confirm.
    Phase 8 reserves DB columns (`documents.hubspot_sync_state`,
    `documents.hubspot_links`, `documents.last_sync_at`,
    `documents.last_sync_error`) and a stub endpoint
    `POST /api/v1/documents/:id/sync` returning `not_synced`.
    Phase 9 wires the actual HubSpot calls behind that endpoint.
  - **Empty deals**: import unconditionally — pricing-NULL is the
    common case, not the exception. No "Generate offer" blocker
    based on field-fill status.
- Alternatives considered:
  - Coverage option A (minimal — 2 columns + JSONB only): rejected
    because the four columns beyond `(id, name)` we did extract
    (`company_type`, `segment_type`, `lifecycle_stage`, both
    timestamps) drive primary UI filters and incremental-sync
    logic. Querying JSONB for every list view is unnecessary.
  - Coverage option C (full ~35 deal columns): rejected. The user
    explicitly asked for the minimum; live data shows only ~12
    fields per deal are reliably useful. Promoting an extra column
    is a one-migration step when a real demand surfaces.
  - Periodic full sync (cron 1×/day): rejected. Adds infra
    (scheduler), creates drift risk between HubSpot edits and our
    cache, and provides no benefit over pull-on-demand for a
    single-operator UI workflow.
  - Auto-hydrate calculator from deal pricing fields (Phase 9
    plan): explicitly killed by the link-only decision above. The
    earlier `bsg_hubspot_field_mapping.md` draft was rewritten to
    remove that path and document why it's deliberately dropped.
- Consequences:
  - `bsg_hubspot_field_mapping.md` fully rewritten under the
    link-only model. Lost: auto-hydrate sections, ~40 lines of
    deal pricing field tables. Gained: explicit `hubspot_raw`
    rationale and validation against live data.
  - `phase_08_backend_plan.md` §3 `companies` and `deals` schemas
    replaced with the chosen column lists + indexes.
  - `.env.example` already had the `HUBSPOT_*` slots set up; no
    further changes needed.
  - `scripts/hubspot-one-company.ts` and
    `scripts/hubspot-merchant-and-deal.ts` committed as reference
    tooling for future field-set re-validations (e.g. after a
    HubSpot schema change).
- Follow-up actions:
  - Phase 8 implementation: when the backend reaches the
    `companies` / `deals` migration step, use the column lists
    above verbatim.
  - Phase 9 stub-to-real-call swap: only the inside of
    `POST /api/v1/documents/:id/sync` changes; column shape stays
    the same.
  - If sales workflow changes and pricing fields start being filled
    reliably, revisit only `hubspot_raw → named column` promotion
    for the specific fields that surface in UI filters. The
    link-only decision itself stands.

### Decision: Phase 8 final functional model (pre-implementation)
- Date: 2026-05-15
- Context:
  - Before starting Phase 8 implementation, the user enumerated the
    final functional model and answered 12 clarifying questions in
    three batches. This entry consolidates all answers so the
    implementation phase has a single authoritative reference.
  - Quote-form summary of the integration contract (user, 2026-05-15):
    > "ми оновлюємо данні про компанію і угоду в нашу базу з хабспота
    >  (данні по компаніях і угодах ми не оновлюємо) тільки вписуємо
    >  нотатку. в нотатці буде лінк на наш сервіс на калькулятор,
    >  пропозицію або договір + можна буде додати текст."
- Decisions (consolidated):

  **A. Data flow**
  - HubSpot → us: read companies, deals.
  - Us → HubSpot: write Notes only (link + addendum). NEVER push
    company / deal field updates back.

  **B. Sync trigger** — Webhooks + manual refresh button.
  - HubSpot Private App webhook subscriptions: `company.creation`,
    `company.propertyChange`, `company.deletion`, `deal.creation`,
    `deal.propertyChange`, `deal.deletion`.
  - Payload contains object id + event type only; backend fetches
    full object from `GET /crm/v3/objects/{type}/{id}`.
  - Signature verification: HMAC SHA-256 with HubSpot client secret
    (new env var `HUBSPOT_WEBHOOK_SECRET`). Reject unverified requests.
  - Listing page has a "Refresh from HubSpot" button as fallback;
    triggers `POST /api/v1/hubspot/refresh` which re-pulls the
    objects currently visible.
  - **No polling cron.** Webhooks + on-demand refresh together cover
    every realistic drift case without hammering the HubSpot API.

  **C. Initial backfill** — One-time on first deploy.
  - Admin command: `npm run hubspot:backfill` (or auto-run on first
    container start when `companies` table is empty).
  - Paginates `GET /crm/v3/objects/companies?limit=100` and
    `/deals?limit=100` exhaustively; upserts into our tables.
  - Targets ~minutes for hundreds of records (BSG scale).
  - After backfill, the system relies on webhooks for fresh data.

  **D. Document numbering** — `BSG-<7digit>-<6digit>`.
  - 7-digit middle = singleton sequence (`document_number_sequence.
    next_doc_id`), starts at 7100001, monotonic, **shared across
    offer + agreement**.
  - 6-digit suffix = **last 6 digits of `hubspot_company_id`**
    (chosen 2026-05-15 by user — NOT deal id). Implication:
    multiple offers for the same company share the suffix; only
    the middle digits differ.
  - Calculator configs DO NOT get a number.

  **E. Calculator configs — separate table**
  - `calculator_configs` table (independent of `documents`):
      id uuid PK
      name text NULL (operator label; auto-suggest from company/deal)
      hubspot_company_id text NULL FK
      hubspot_deal_id text NULL FK
      payload jsonb NOT NULL (full DocumentTemplatePayload-like)
      created_at, updated_at, created_by, last_edited_by
  - Mutable: operator edits freely, no number, no immutability.
  - Hard-delete allowed (operator can delete drafts they don't need).

  **F. Documents — immutable after save**
  - `documents` table:
      id uuid PK
      document_number text UNIQUE NOT NULL
      document_type text NOT NULL CHECK ('offer' | 'agreement')
      hubspot_company_id text NOT NULL FK
      hubspot_deal_id text NULL FK  (← deal optional, company mandatory)
      payload jsonb NOT NULL (frozen snapshot at save)
      source_calculator_config_id uuid NULL FK → calculator_configs.id
      source_document_id uuid NULL FK → documents.id (template lineage)
      hubspot_sync_state text NULL (Phase 9)
      hubspot_links jsonb NULL (Phase 9; `{ companyNoteId, dealNoteId? }`)
      last_sync_at timestamptz NULL
      last_sync_error text NULL
      created_at, created_by  (immutable after these are set)
  - **No UPDATE allowed.** Operator "edits" by creating a new doc
    with `source_document_id = <old>` and a fresh number.
  - **No delete allowed** for offers/agreements (immutable
    business documents; HubSpot notes would dangle).

  **G. Save flow**
  - Operator builds calc → clicks "Save offer/agreement":
      POST /api/v1/documents
      body: { document_type, source_calculator_config_id, hubspot_company_id, hubspot_deal_id? }
      backend:
        1. Allocate number atomically (`document_number_sequence`)
        2. Freeze calc payload into `documents.payload`
        3. INSERT documents row
        4. Return { document_number, id }
      The source `calculator_configs` row is UNCHANGED — operator
      keeps editing it, can generate another offer later.
  - Use-as-template flow:
      POST /api/v1/documents
      body: { document_type, source_document_id, ... }
      backend creates a NEW `calculator_configs` row seeded with the
      source document's payload, returns redirect URL `/calc/<uuid>`.
      Operator edits in calc UI, then saves as offer/agreement.

  **H. Note write-back** — Template + free addendum.
  - On document save, frontend prompts operator for optional free
    text (1-line input).
  - Backend (Phase 9; stubbed in Phase 8) posts a Note to both the
    Company and the Deal (if linked) via
    `POST /crm/v3/objects/notes`, body shape:
      <b>📄 BSG-7100123-874808 — Offer</b>
      Created 2026-05-15 by operator@bsg.com
      <a href="...">View document</a>
      <hr>
      <i>{operator addendum, if any}</i>
  - Note id stored in `documents.hubspot_links.companyNoteId` /
    `.dealNoteId` for later updates.

  **I. Listing page** — Hierarchical Company → Deals → Documents.
  - Tree/accordion view:
      [+] (M) Acme Ltd            — 2 deals, 3 documents
        ├─ Deal: CEI Processing   — appointmentscheduled · €500,000
        │   ├─ BSG-7100123-874808 (Offer · 2026-05-12)
        │   └─ Calc draft "v2 with CH share"
        └─ Standalone documents (no deal)
            └─ BSG-7100099-874808 (Offer · 2026-04-30)
  - Backend endpoint: `GET /api/v1/listings/companies?expand=deals,docs`
    returns the joined hierarchy in one shot to avoid waterfall
    requests.
  - Pagination: by company. Default 50 companies per page.

  **J. Permissions** — All authenticated users see all data.
  - `documents.created_by` and `calculator_configs.created_by`
    stored for audit. No per-user filtering in Phase 8.
  - JWT auth gates the listing; once logged in, everything visible.
  - Phase 9+ may add roles.
- Alternatives considered (rejected):
  - Daily cron sync: rejected vs webhooks for being noisier on
    HubSpot side and slower to surface changes.
  - Pull-on-demand with TTL 300s: rejected because user explicitly
    wanted minimal HubSpot load; webhooks achieve that better.
  - Unified `documents` table with `document_type=calculator_config`
    and NULL document_number: rejected — mixes mutable and immutable
    semantics in one table; separate `calculator_configs` is cleaner.
  - Suffix from deal_id: rejected per user — suffix is from
    company_id so all docs for one company group visually.
  - Per-user document visibility: rejected for Phase 8 simplicity.
  - Soft-delete for offers/agreements: rejected — HubSpot notes
    would dangle, and "immutable business document with new
    revision via clone" is a cleaner story than tombstone rows.
- Consequences:
  - DB schema fully specified — implementation can start without
    further schema design.
  - New env var: `HUBSPOT_WEBHOOK_SECRET` (HMAC verification).
  - Backend gains 4 new endpoint groups:
      `/api/v1/calculator-configs/*` (CRUD)
      `/api/v1/documents/*` (immutable + listing)
      `/api/v1/hubspot/webhooks` (POST receiver)
      `/api/v1/hubspot/refresh` (POST manual trigger)
  - Frontend gains:
      `/login` (auth)
      `/listings` (hierarchical Company → Deal → Docs)
      `/calc/:id` (existing wizard, wired to backend)
      `/documents/:number` (read-only view + "Use as template")
  - PDF render: existing `buildOfferPdfHtml` + Puppeteer in same
    container.
  - Phase 9 = wire Note write-back + add HubSpot stage transitions.
- Follow-up actions:
  - Update `phase_08_backend_plan.md` schemas + endpoints per above
    (next commit).
  - Add `HUBSPOT_WEBHOOK_SECRET` to `.env.example` (next commit).
  - Propose phased implementation plan (7 sub-phases, ~7 dev-days).
  - User picks which sub-phase to start with.

### Decision: Phase 8 architectural conventions ratified
- Date: 2026-05-15
- Context:
  - Post-decisions architecture audit (architect agent, 2026-05-15)
    surfaced 8 🔴 CRITICAL doc-level blockers plus ~15 🟡 important
    items. User instruction: "фіксимо відразу всю документацію все
    правильно описуємо. Складай повну чітку архітектурно правильну
    документацію."
  - Audit also surfaced an explicit user requirement on PDFs:
    "Стосовно пдф які будуть генеруватися потрібно буде відразу
    очищати все що б не засмічувати" — translated: "regarding PDFs
    being generated, we need to clean everything up immediately so
    we don't pollute".
- Decisions:

  **A. PDF lifecycle — stream-only, no disk, no cache.**
  - Each `GET /api/v1/documents/:number/pdf` request renders fresh
    via Puppeteer + `buildOfferPdfHtml(payload)` into an in-memory
    Buffer, streams to HTTP response, releases Buffer on response
    end. NO filesystem write. NO Redis/S3 cache.
  - Rationale: documents are immutable, rendering is deterministic,
    no correctness gain from caching, eliminates GC burden in
    single-container deploy.
  - Future: if >10 RPS sustained on PDF generation, add Redis cache
    keyed by `document_number` with TTL. Phase 8 doesn't need it.

  **B. Puppeteer browser recycle policy.**
  - Headless Chrome leaks memory. Browser process is killed +
    re-spawned after EITHER `PUPPETEER_RENDERS_PER_BROWSER` (default
    1000) OR `PUPPETEER_BROWSER_TTL_MS` (default 24h).
  - `BrowserPool` class in `server/modules/pdf/pdf.browser-pool.ts`
    tracks renderCount + spawnedAt, checks on each `getBrowser()`.
  - OOM-style render failures force-recycle the browser before
    returning 500.

  **C. Schema fixes (added to documents/users/refresh_tokens).**
  - `users.email` and `users.login` typed as `citext` (extension
    enabled in initial migration). Removes manual `LOWER()` wrapping
    for login lookups.
  - `users.is_admin boolean NOT NULL DEFAULT false`. Gates
    `/api/v1/users/*` endpoints. First admin via
    `npm run create-user --admin` CLI.
  - `refresh_tokens.last_used_at timestamptz NULL` for active-session
    listing.
  - `refresh_tokens` partial index on `(user_id) WHERE revoked_at
    IS NULL` for fast active-session queries.
  - `documents.hubspot_sync_updated_at timestamptz NULL` — sync
    state needs its own timestamp distinct from `last_sync_at`
    (success time).
  - All CHECK constraints written out as SQL:
      documents_document_type_check
      documents_source_xor_check  (exactly one source is non-NULL)
      documents_document_number_format_check  (regex)
      documents_hubspot_sync_state_check  (allowed values)

  **D. Error response envelope.**
  - Single shape: `{ error: { code: string, message: string,
    details?: object } }`.
  - Codes are stable strings: `AUTH_INVALID_CREDENTIALS`,
    `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `CONFLICT_*`,
    `FORBIDDEN`, `UNPROCESSABLE`, `RATE_LIMITED`, `INTERNAL_ERROR`,
    `HUBSPOT_UNREACHABLE`, `DB_UNAVAILABLE`. Documented in
    `backend_conventions.md` §2.
  - Every error response carries `X-Request-Id` header.

  **E. Logging — pino + pino-http.**
  - JSON-only output. Required fields: `ts`, `level`, `msg`.
    Encouraged: `reqId`, `userId`, `route`, `durationMs`.
  - Level semantics defined in `backend_conventions.md` §3.
  - HTTP request line per request via pino-http; NEVER log request
    body (secrets risk).

  **F. Config loading — single `config/env.ts` with Zod.**
  - Reads ALL env vars in one place at module load. Fails fast on
    missing/invalid. Frozen object exported as `env`.
  - No `process.env.X` access anywhere else in `server/`.
  - 24 env vars enumerated in `backend_conventions.md` §4.

  **G. Folder structure — vertical slices in `modules/`.**
  - Each domain (auth, users, companies, deals, calculator-configs,
    documents, hubspot, pdf, listings) is a self-contained module
    with `routes.ts`, `controller.ts`, `service.ts`, `schemas.ts`,
    `repository.ts`.
  - Cross-module: services can call other services. Repositories
    are private.
  - Full tree in `backend_conventions.md` §1.

  **H. Save semantics — RECONCILED.**
  - Calculator configs: **debounced auto-save** (1s) via
    `PATCH /api/v1/calculator-configs/:id`. Operator may spend
    hours; losing work to a reload is unacceptable.
  - Documents (offer/agreement): **never auto-saved**. Only via
    explicit `POST /api/v1/documents` action that allocates a
    number + freezes the payload. Number allocation is a deliberate
    act.

  **I. Refresh-token rotation — grace window 10s.**
  - Multi-tab races: tokens revoked within last 10s still accepted,
    but ONLY issue a new access token (not a new refresh). Avoids
    logging the user out on legitimate concurrent refresh attempts.
  - Frontend supplements with single-flight: concurrent
    `/auth/refresh` calls collapse into one promise.

  **J. Webhook idempotency — `hubspot_webhook_events` table.**
  - Every event INSERTed with UNIQUE constraint on
    `hubspot_event_id` (ON CONFLICT DO NOTHING). Ack 200 to HubSpot
    fast (<50ms), process async via worker reading pending rows.
  - Failed processing increments `attempts` + records `last_error`.
    At ≥5 attempts the row is left for manual triage (Phase 9
    alerting).
  - Schema added to `phase_08_backend_plan.md` §7.5.1.

  **K. Per-endpoint auth matrix documented.**
  - Table in `phase_08_backend_plan.md` §4.0 specifies which scheme
    (none, refresh cookie, access bearer, HMAC) and which role
    (any active user, is_admin) gates each endpoint.
  - `POST /api/v1/users/*` and `POST /users/:id/reset-password`
    now correctly require `is_admin = true`.

  **L. Stale `clients` table references purged.**
  - `client_and_hubspot_workflow.md` fully rewritten. The Phase 8 /
    Phase 9 split was correct CONCEPTUALLY but used a deprecated
    schema vocabulary. New version aligns to the actual data model
    (HubSpot day-1 via webhooks + manual refresh, no `clients`
    intermediate table).

  **M. Test strategy breakdown.**
  - 60 unit + 80 integration + 10 e2e + 10 pixel-diff = ~160 tests
    total. Tooling: vitest + supertest + Testcontainers Postgres +
    Playwright + nock for HubSpot mocks. Detailed in
    `backend_conventions.md` §12.

- Alternatives considered (rejected):
  - PDF cache in Redis/S3: rejected per explicit user requirement
    "очищати все що б не засмічувати". Revisit if perf justifies.
  - Persistent webhook events with full retry orchestrator
    (Kafka/SQS): overkill for 100-500 docs/month. Pg table +
    in-process worker handles the volume.
  - Refresh-token jwt-with-revocation-list: rejected vs DB-row-based
    revocation because we need active-sessions listing anyway.
  - Per-feature-module barrel `index.ts`: rejected — direct imports
    make the dep graph readable in PR diffs.
- Consequences:
  - `phase_08_backend_plan.md` substantially extended: schema fixes,
    auth matrix, PDF lifecycle, browser recycle, webhook idempotency,
    refresh-token race.
  - NEW: `docs/backend_conventions.md` consolidates folder layout,
    error envelope, logging, config, validation, TX, rate limit,
    CORS, health, migration tooling, pagination, test strategy.
  - REWRITTEN: `docs/client_and_hubspot_workflow.md` aligns to the
    HubSpot-day-1 model.
  - NEW env vars: `HUBSPOT_WEBHOOK_SECRET`,
    `PUPPETEER_RENDERS_PER_BROWSER`, `PUPPETEER_BROWSER_TTL_MS`.
  - Implementation can start with zero design ambiguity.
- Follow-up actions:
  - Create `docs/phase_08_implementation_plan.md` mapping
    decisions to a sprint plan (next commit).
  - Begin coding Sprint 1 (Foundation: Drizzle + users +
    refresh_tokens + auth) after user gives green light.

### Decision: Phase 8 DB audit cleanup (pre-implementation)
- Date: 2026-05-15
- Context:
  - User raised concern before coding starts: "мене хвилює аудит
    бази даних правильність структур і чи сама база оптимізована
    і швидка" — DB audit needed before writing migrations.
  - Ran `database-reviewer` agent on all 8 documented tables +
    indexes + concurrency patterns.
  - Audit confirmed CORRECT: text+CHECK over enum (evolvability),
    citext for email/login (case-insensitive without LOWER()
    wrapping), `text` not `varchar(N)` (no storage difference, CHECK
    is more expressive), `timestamptz` everywhere, atomic numbering
    via UPDATE … RETURNING (gap-free, rolls back with TX, NOT
    Postgres SEQUENCE), HubSpot raw JSONB WITHOUT GIN (no documented
    query searches inside), 3-query approach over LATERAL JOIN for
    listings (parallel, predictable latency, no PG memory pressure).
  - Audit surfaced 6 explicit doc-level fixes needed before code:
- Decisions / fixes applied:

  **A. Timestamp defaults — all auto-managed columns get
  `NOT NULL DEFAULT now()`**
  - `companies.created_at`, `companies.updated_at`,
    `companies.last_synced_at` — now all `NOT NULL DEFAULT now()`.
  - Same for `deals.{created_at, updated_at, last_synced_at}`.
  - Same for `calculator_configs.{created_at, updated_at}`.
  - Previously the prose was ambiguous (just `timestamptz`) which
    would generate nullable columns in Drizzle — every INSERT path
    would have had to set them manually. Defaults eliminate the
    bug class.

  **B. UUID PK defaults — `DEFAULT gen_random_uuid()` everywhere**
  - All `id` columns on `companies`, `deals`, `calculator_configs`,
    `documents`, `users`, `refresh_tokens`, `hubspot_webhook_events`
    explicitly default to `gen_random_uuid()` (Postgres built-in,
    no extension needed at PG 13+).
  - Removes risk of any INSERT path emitting a nil UUID.

  **C. Full FK matrix with ON DELETE / ON UPDATE on every FK**
  - Added §3.2 to phase_08_backend_plan.md with the authoritative
    11-row FK matrix. Key policies:
      `documents.hubspot_company_id → companies` = RESTRICT (cannot
      orphan a business document), CASCADE on update (HubSpot ID
      re-keys propagate).
      `documents.hubspot_deal_id → deals` = SET NULL (doc survives
      a deal deletion).
      `documents.source_document_id → documents` = self-FK,
      RESTRICT (cannot delete a template that has clones).
      `documents.source_calculator_config_id → calc_configs` =
      SET NULL (calc deletion preserves the immutable doc).
      `documents.created_by → users` = RESTRICT (cannot delete a
      user who authored documents).
      `deals.hubspot_company_id → companies` = RESTRICT, UPDATE
      CASCADE.
      `refresh_tokens.user_id → users` = CASCADE (delete user
      revokes sessions).
      `calculator_configs.*` FKs to companies/deals = SET NULL on
      delete (calcs can survive in a degraded state); to users =
      RESTRICT (authorship preserved).
  - Without these explicit policies Drizzle defaults to
    `ON DELETE NO ACTION` which would let webhook deletes leave
    orphaned FKs.

  **D. Self-FK on `documents.source_document_id` as separate ALTER**
  - Postgres cannot validate a self-FK during CREATE TABLE.
    Drizzle Kit emits the ALTER as a follow-up statement. Pattern
    documented in §3.2 and `backend_conventions.md` §10.

  **E. Covering INCLUDE indexes for the listings query**
  - `deals.(hubspot_company_id, hubspot_created_at DESC)`
    INCLUDE (`name`, `stage`, `amount`, `currency`).
  - `documents.(hubspot_company_id, document_type, created_at DESC)`
    INCLUDE (`document_number`).
  - `calculator_configs.hubspot_company_id` INCLUDE (`id`, `name`,
    `updated_at`).
  - Combined with the 3-query approach for `GET /listings/companies`,
    these turn the listing endpoint into index-only scans —
    realistic latency 30ms at 50 companies / page.

  **F. Missing FK index: `documents.created_by`,
  `calculator_configs.last_edited_by`, `documents.source_*_id`**
  - Each FK column needs its own index for fast delete-RESTRICT
    checks. Added to the documents and calculator_configs index
    lists. Source-id indexes are partial (`WHERE … IS NOT NULL`)
    since most rows have only one source set.

  **G. Refresh-token grace window updates `last_used_at`**
  - Previously the grace-window branch returned a new access token
    but didn't bump `last_used_at`, leaving the active-sessions
    view stale. Fixed in §9.
- Alternatives considered:
  - Surrogate-only FKs (FK to `companies.id` uuid, not natural
    key): rejected. Natural-key FK matches HubSpot semantics, and
    `ON UPDATE CASCADE` handles re-key. Two more JOIN steps per
    listing query would have been needed for the surrogate path.
  - Postgres `SEQUENCE` for numbering: rejected. Sequences don't
    roll back on TX abort — failed INSERT would leave a gap. Our
    requirement is gap-free. The `document_number_sequence` table
    is the right pattern.
  - GIN on `hubspot_raw` JSONB: rejected. No documented query
    searches inside. Maintenance cost on every upsert ≠ zero.
  - `pg_trgm` for HubSpot name search: rejected. Prefix-only
    autocomplete (text_pattern_ops B-tree) suffices at 5000
    companies. Reconsider when mid-string search is requested.
  - Materialized view for listings: rejected. Refresh complexity
    on every doc INSERT / calc PATCH / deal upsert; no benefit
    over indexed queries at our volume.
- Consequences:
  - All 6 audit blockers closed. Drizzle migration files can be
    written verbatim from §3 of phase_08_backend_plan.md.
  - Phase 8 implementation can start with no further DB design
    work.
- Follow-up actions:
  - Start Sprint 1 (Foundation) on branch `phase-8-foundation`.

### Decision: Sprint 2 — restrict companies to `direct_client` only
- Date: 2026-05-16
- Context:
  - First live backfill on 2026-05-16 pulled all 51 BSG HubSpot
    companies (23 Clients, 23 Agents/referring partners, 2 NULL).
  - User reviewed the data and clarified the scope:
    > "мені цікавить тільки компані тайп Client — інші компанії
    >  зараз мене не цікавлять. А діли всі тягнемо і даємо
    >  можливість фільтрувати"
  - Translation: only `company_type = direct_client` companies are
    relevant to BSG's calculator/document workflow. Agents
    (`referring_partner`) are referenced in deals via the free-text
    `agent_label` field but never need their own row in our cache.
    Deals stay unfiltered + filterable in UI.
- Decision:
  - Add env var `HUBSPOT_COMPANY_TYPE_FILTER`, default
    `direct_client`. Empty string disables the filter.
  - Backfill switches from `GET /crm/v3/objects/companies` (List)
    to `POST /crm/v3/objects/companies/search` with
    `filterGroups: [{ filters: [{ propertyName: "company_type",
    operator: "EQ", value: <filter> }] }]` when a filter is set.
    Server-side filtering is more efficient than pull-then-drop.
  - **Cleanup pass** at the START of each backfill: DELETE deals
    whose company is about to be removed, DELETE companies whose
    `company_type` doesn't match the filter (including NULL).
    Backfill becomes "make the DB match the filter contract".
  - Deals: ALL deals still pulled. Deals whose
    `hs_primary_associated_company` is an unfiltered company are
    skipped via the existing FK-violation log path. Verified live:
    8 HubSpot deals → 7 upserted, 1 skipped (referenced an agent
    company that's no longer in our DB).
  - Remove the now-redundant `companyType` filter from
    `GET /api/v1/companies` API (every row is already
    `direct_client`). Existing query param is ignored silently;
    extra Zod params don't 400.
  - Add `businessVertical` filter to deals API
    (`GET /api/v1/deals?businessVertical=iGaming%20%2F%20Betting`).
    Operator can now filter by vertical without writing custom SQL.
- Alternatives considered:
  - Client-side filter (pull all, drop in mapper): rejected.
    Wastes API calls (~50% of fetches are throwaway) + complicates
    "what changed?" logic when filter loosens.
  - Hard-coded `direct_client` (no env var): rejected — having a
    knob future-proofs the cache for "include aggregators only"
    scenarios.
  - Don't delete existing rows (just skip new ones): rejected.
    DB would accumulate stale wrong-type rows across runs; backfill
    should be the alignment operation.
  - `ON DELETE CASCADE` on companies → deals FK: rejected. The
    FK policy is `RESTRICT` for data-integrity reasons (a webhook-
    delivered company.deletion event must NOT silently lose
    documents). Backfill cleanup is an admin operation that knows
    what it's doing and explicitly deletes deals first.
- Consequences:
  - DB schema unchanged. Only env config + backfill logic + a
    single API filter change.
  - Live test on real BSG tenant: 48 companies + 8 deals →
    23 direct_client companies + 7 deals. Cleanup deleted
    25 non-matching companies + 1 orphan deal.
  - All 87 server tests still pass; 1 integration test re-purposed
    from "filters by company_type" to "ignores unknown query
    params" + 1 new test "filters by businessVertical".
- Follow-up actions:
  - bsg_hubspot_field_mapping.md updated with the storage-filter
    section.
  - When Sprint 5 (webhooks) ships, the webhook receiver MUST
    apply the same filter — only ack/upsert events for matching
    `company_type`. Otherwise an Agent could leak in via a
    webhook event between backfills.

### Decision: Sprint 2.7 — audit-driven hardening cycle (A → I)
- Date: 2026-05-16
- Context:
  - Phase 8 Sprints 1-2.6 delivered a working backend (auth +
    companies + deals + HubSpot client + backfill). User then
    asked for a full audit pass before Sprint 3 (Calculator
    Configs) to clear technical debt while the surface area was
    still small enough to refactor cheaply.
  - The cycle ran four audit rounds (3× typescript-reviewer +
    1× security-reviewer), closing every finding (HIGH/MED/LOW/
    NICE-TO-HAVE/HARDENING) in nine numbered commits A-I. User
    pattern: "фіксимо повністю всі проблеми" each round.
  - Aggregate: ~25 findings closed across 9 commits, +~600 LOC
    in helpers / refines / tests, -1 dead env var, 0 regressions
    (128/128 server + 259/259 frontend stayed green throughout).
- Decision:
  - Treat the closed-loop "audit → fix → re-audit" as the
    completion gate for each backend sprint going forward, NOT
    only Sprint 2.x. The cost is ~½ day per sprint, the benefit
    is that no LOW-severity finding compounds into a HIGH one
    later when the file is harder to refactor.
  - Commits A-I in detail:
    - 2.7.A (2890b38): TTL fallback semantics + /pipelines
      endpoint extracted from inline controller logic.
    - 2.7.B (88f1bfc): Backfill decomposition (orchestrator /
      page-fetch / mapper) + N+1 fix when deal misses its
      primary company in cache.
    - 2.7.C (23175cc): hubspot.client retry/backoff covered by
      8 new unit tests (429, 5xx, network err, retry budget).
    - 2.7.D (6756b03): NICE polish — buildPage() pagination
      helper, q.min(2) on search, clampLimit removed.
    - 2.7.E (6a804df): Thundering-herd guard on pipelines
      cache + per-route rate-limit stacking + boundary test
      for "exactly limit" requests.
    - 2.7.F (d83282d): Extracted ttl-refresh + dto-parse +
      hubspot soft-validate helpers (3 helpers, 0 duplication).
    - 2.7.G (b4eedd2): Removed dead ZodError re-export.
    - 2.7.H (a9ddcc9): 8 fixes from fresh review — race on
      pipelines cache, expiry comparison, JWT regex, console →
      logger, parseTimestamp negative-numeric path, cookie
      null sentinel, env-gated auto-backfill, log dedup.
    - 2.7.I (127f8be): 7 security-review fixes — TRUST_PROXY_HOPS
      env, sameSite strict, pino redact paths, SSRF refine for
      HUBSPOT_API_BASE_URL, webhook secret required in prod,
      body limit 5mb → 1mb, removed unused JWT_REFRESH_SECRET.
- Alternatives considered:
  - "Fix only HIGH/MED, defer LOW to backlog": rejected at user
    request. Rationale: LOW findings in a freshly-written module
    almost always shrink the cost of the next refactor; deferring
    them invites the "we'll get to it after Sprint X" trap.
  - "Single big commit at the end": rejected. Each sub-commit
    represents one re-audit, which makes the rationale traceable
    and gives clean rollback boundaries if anything regresses.
- Consequences:
  - Backend enters Sprint 3 with: 0 EXPLOITABLE / 0 RISKY / 0
    HARDENING security findings; typecheck:server clean; vite
    build clean; 128 server + 259 frontend tests green.
  - Shared helpers established: `shared/ttl-refresh.ts`,
    `shared/dto-parse.ts`, `shared/build-page.ts`,
    `shared/db-helpers.ts`. Sprint 3+ modules should reuse them
    rather than re-implementing pagination / output-validation.
  - Soft-validation pattern (Zod `safeParse` → log on drift,
    fall through to cast) established for HubSpot responses;
    same pattern recommended for any external API client.
  - `JWT_REFRESH_SECRET` env var REMOVED — refresh tokens are
    opaque random strings (SHA-256-hashed). If any docs / ops
    scripts still reference it, they MUST be updated; the env
    loader will silently ignore an unknown key.
  - `TRUST_PROXY_HOPS` env var ADDED with default 1. Production
    deploys MUST verify the value matches the real Traefik hop
    count to avoid X-Forwarded-For spoofing of `req.ip`.
- Follow-up actions:
  - Sprint 3 (Calculator Configs): start on the same branch
    with the helpers above as the reuse baseline.
  - Sprint 5 (webhooks): the env validator now REQUIRES
    `HUBSPOT_WEBHOOK_SECRET` in production. Ops must set a
    secret before the next prod deploy even though the webhook
    handler ships later — see env.ts superRefine.
  - Codemap regenerated to reflect new shared helpers + the
    nine modules under `server/`.

### Decision: Sprint 2.8 — frontend integration layer (A → E)
- Date: 2026-05-16
- Context:
  - After Sprint 2.7 the backend was complete (auth, companies,
    deals, HubSpot reads). A manual probe showed the SPA had ZERO
    network calls into it — `src/lib/` had `printHtmlViaIframe.ts`,
    `src/contexts/` had only `CalculatorContext.tsx`, no
    `fetch`/`axios` anywhere in `src/`. The backend was running in
    a vacuum.
  - Rather than continue to Sprint 3 (Calculator Configs) and grow
    the contract surface before frontend ever validated it, we did
    the wire-up first. That moved part of the original Sprint 6
    frontend work earlier; the rest (calc page + document view page)
    waits for Sprint 3 + Sprint 4 backend to ship.
- Decision:
  - **Stack**: axios singleton + interceptors, TanStack Query v5 for
    server state (useInfiniteQuery for cursor pagination), react-
    hook-form + zod for forms (reuses backend Zod schemas where
    possible), in-memory access-token storage (NEVER localStorage).
  - **Vite dev proxy**: `/api/* → http://localhost:8080` with
    `changeOrigin: true`. Prod serves SPA + API from the same
    Express, so the proxy is dev-only.
  - **Routing**: `/` redirects to `/companies` (the natural workflow
    entry), all routes except `/login` sit behind `<PrivateRoute />`
    which gates on the AuthContext's `isBooting / user` state.
  - **Five commits A → E** delivered:
    - 2.8.A (6b9c7a4): API client + types + axios interceptors —
      `src/api/{client,types,auth,companies,deals,hubspot,index}.ts`
      + 8 unit tests covering Bearer attach, refresh-on-401,
      single-flight refresh, session-lost callback, envelope
      mapping. Vite proxy added.
    - 2.8.B (4b63755): AuthProvider + QueryClientProvider —
      `src/contexts/AuthContext.tsx` cold-boots via /auth/refresh,
      hydrates user via /auth/me, exposes `login/logout` actions +
      `user/isBooting` state. main.tsx wraps the app.
    - 2.8.C (fe3e27b): LoginPage + PrivateRoute + route reorg.
      react-hook-form + zod schema mirroring backend
      loginRequestSchema. Error envelope mapped to human messages
      per `code`. AppShell extended with IdentityStrip (signed-in
      name + Sign out) + a Companies workspace tab. Existing
      calculator/wizard tests updated to async `renderApp()`.
    - 2.8.D (5f8042e): CompaniesPage with debounced search +
      cursor pagination. `useCompanies` (useInfiniteQuery) +
      `useDebouncedValue` hooks. 5 integration tests covering
      loading / empty / error / debounced search / Load more.
    - 2.8.E (c5778fe): CompanyDetailPage — company header + deals
      table with the same pagination tail. `useCompany` (useQuery)
      + `useCompanyDeals` (useInfiniteQuery) hooks. 5 tests
      including amount formatting edge cases.
  - **Sprint 2.8.F (audit closure, A → E in F.1 → F.5)** — after
    a triple-agent audit (TypeScript reviewer + security reviewer
    + code reviewer in parallel) we closed 34 findings across
    5 sub-commits:
    - F.1 (769e5fb): CRITICAL — `PublicUser` interface diverged
      from backend `userPublicSchema` on every field except `id`
      and `displayName` (declared `role/active/createdAt`; wire
      has `email/isAdmin/isActive`). Updated types + every test
      fixture. `CursorPage<T>` gained the `limit` field the
      backend always emits.
    - F.2 (cad13ac): HIGH — StrictMode-safe cold boot via
      `useRef` latch (was firing two /auth/refresh calls per dev
      page load); LoginPage `isBooting` guard to suppress the
      form-flash on direct /login deep-link.
    - F.3 (79c1060): HIGH — axios module augmentation for
      `_isRefresh`/`_retry` (no more `as unknown as` double
      casts); refresh single-flight race fixed by moving the
      singleton release to `.then(cleanup, cleanup)` so it queues
      behind callers' continuations; `useInfiniteQuery<…, Error,
      …>` typed as `ApiError` so `error.code` is reachable
      without runtime `instanceof`.
    - F.4 (2ebcdaf): 11 MED — `useMemo` for flattened items,
      `normaliseSearch` helper unifying buildKey + query
      threshold, LoginPage `resolveSafeFromPath` with path-
      relative guard, AppShell `handleLogout` try/finally,
      isFetching background indicator, shared `formatDate`
      helper, `vi.restoreAllMocks` test pattern, session-lost
      handler test, renderApp cleanup.
    - F.5 (06810f8): 16 LOW + nice-to-have — PrivateRoute test
      (3 cases), AppShell IdentityStrip test (2 cases),
      `<LoadMoreButton />` extracted, `src/shared/constants.ts`
      (`QUERY_STALE_TIME_MS`, `QUERY_GC_TIME_MS`,
      `SEARCH_DEBOUNCE_MS`), vite-env.d.ts cross-origin warning,
      ApiError.details security JSDoc, setSessionLostHandler
      single-slot doc, snapshotShape.ts clientNotes
      Sprint-3-Zod-cap reminder.
- Alternatives considered:
  - Keep Sprint 3 backend first: rejected. Adding another module
    before the frontend layer existed risked growing API contracts
    that would never get exercised until much later.
  - Use SWR instead of TanStack Query: rejected. TanStack's
    `useInfiniteQuery` with `getNextPageParam` mapped cleanly to
    our cursor pagination; SWR's pagination story is less ergonomic.
  - Store access token in `localStorage`: rejected. XSS would yield
    an instantly-stealable long-lived credential. Module memory +
    httpOnly refresh cookie is the standard pattern.
  - Validate API responses with Zod at the frontend boundary
    (mirroring backend schemas): deferred. The cost (a `.parse()`
    call per response, plus duplicating every schema in `src/api/`)
    isn't justified at the current scale, and the F.1 finding shows
    that drift is catchable by careful TypeScript review. Revisit
    when more endpoints exist or when shared zod-schemas refactor
    lands.
- Consequences:
  - 5 (A-E) + 5 (F.1-F.5) = 10 commits between `92a4649` (drizzle
    audit fix) and `06810f8`.
  - Frontend baseline now includes: `src/api/` (8 files), `src/
    contexts/AuthContext.tsx`, `src/hooks/` (3 hooks), `src/pages/
    {LoginPage,CompaniesPage,CompanyDetailPage}`, `src/components/
    {PrivateRoute,LoadMoreButton}`, `src/shared/{format,constants}`.
  - Frontend tests: 227 (203 pre-2.8 + 8 client + 7 auth + 6 login
    + 5 companies + 5 detail + 3 PrivateRoute + 2 AppShell — minus
    re-counted overlaps after the worktree exclusion fix).
  - Backend unchanged for 2.8; new env var TRUST_PROXY_HOPS still
    holds; npm audit 0.
- Follow-up actions:
  - Sprint 3 (Calculator Configs) will piggyback on the patterns
    established here: `src/api/calculator-configs.ts`,
    `src/hooks/useCalculatorConfigs.ts`, `<CalcConfigPage />`
    reusing `<LoadMoreButton />` + `formatDate` + the search
    debounce pattern.
  - Sprint 6 (original "Frontend integration" plan) is partially
    DONE — auth + listings already shipped. Remaining scope: calc
    page (/calc/:id), document view (/documents/:number), wizard
    URL-driven hydration. Will fold into the corresponding sprint
    (Sprint 3 wires calc page; Sprint 4 wires document view).
  - Production deploys MUST manually clean any users with the
    pre-F.1 phantom `role` column reference if any external code
    consumes /auth/me — none does today.

### Decision: Pre-Sprint 3 — Calculator config + Document anchors + UX shape
- Date: 2026-05-17
- Context:
  - After Sprint 2.8 the SPA validated the auth + companies + deals
    flow against the backend, but every downstream entity (calculator
    configs, documents) still had open architectural questions about
    HOW they hang off the company/deal hierarchy. Locking these now
    avoids the much-more-expensive refactor that would follow a
    Sprint 3 schema commit.
  - User reviewed an ASCII wireframe of the future
    `/companies/:id` page (Overview / Deals / Documents tabs) plus
    the operator journey (login → company → calc → doc) and chose
    one option per axis: A2, B2, C1, D3.
- Decision:
  - **A2 — Documents anchor: `company_id NOT NULL` + `hubspot_deal_id NULLABLE`**.
    Every document belongs to a company. Optionally also belongs to a
    deal. Schema:

        documents.company_id        UUID NOT NULL REFERENCES companies(id)
        documents.hubspot_deal_id   TEXT NULL REFERENCES deals(hubspot_deal_id)

    The Documents tab on `/companies/:id` lists ALL the company's
    documents and renders the Deal column when present, falling back
    to "—" for company-level docs. Standalone offers (e.g. a generic
    proposal without a tracked deal) are first-class.
  - **B2 — Calculator configs anchor: same shape as Documents**.

        calculator_configs.company_id      UUID NOT NULL REFERENCES companies(id)
        calculator_configs.hubspot_deal_id TEXT NULL REFERENCES deals(hubspot_deal_id)

    Symmetric with documents so the "save calc as offer" flow can
    just carry both ids through verbatim. A "create new calc for
    this deal" button on a deal row in `/companies/:id` pre-fills
    `hubspot_deal_id`; the global "+ New calculation" button on
    the company header leaves it null.
  - **C1 — Listing UX: tabs on detail page, NOT hierarchical accordion**.
    Keep Sprint 2.8's flat CompaniesPage table. Extend
    CompanyDetailPage with three tabs:
      - Overview (current header dl)
      - Deals (current deals table)
      - Documents (NEW — Sprint 6 wiring; backend lands in Sprint 4)
    The original Sprint 6 spec called for a hierarchical accordion on
    `/listings`. Rejected because:
      (a) tabs are simpler to paginate (each tab uses its own
          useInfiniteQuery)
      (b) the accordion conflated three different cursor streams
          (companies, deals, docs) onto one page, fighting React Query
      (c) tabs match the mental model "this company has Deals AND
          Documents" rather than "Documents are nested inside Deals"
  - **D3 — `/wizard` becomes a thin shim that creates a blank config
    and redirects to `/calc/:newConfigId`**. Sprint 6 will rewrite
    WizardPage's mount handler:

        // current
        renders the wizard with local state

        // post-Sprint 6
        POST /calculator-configs { companyId: null, ... blank seed }
          → newConfigId
          → navigate(`/calc/${newConfigId}`, { replace: true })

    Loses the "manual blank" deep-link convenience of today but
    consolidates into one pipeline (single source of truth for
    autosave + persistence). Tests for `?source=manualBlank` URL
    params can be deleted along with the manual wizard state.
- Alternatives considered:
  - A3 (document MUST have a deal): rejected. BSG's sales flow
    sometimes produces an offer before a HubSpot deal exists — the
    deal is created later when the offer is accepted.
  - B3 (config MUST have a deal): same rejection for the same reason.
  - C2 (hierarchical accordion): rejected, see above.
  - D2 (delete /wizard): rejected. Existing tests + bookmarks still
    reference /wizard; a redirect preserves them without dual logic.
- Consequences:
  - Sprint 3 SQL migration schema is now locked:
      - `calculator_configs.company_id UUID NOT NULL`
      - `calculator_configs.hubspot_deal_id TEXT NULL`
      - FK ON DELETE: company → CASCADE (drop configs when company
        is removed), deal → SET NULL (configs survive a deal
        deletion, the deal column just nulls out).
  - Sprint 4 SQL migration schema:
      - `documents.company_id UUID NOT NULL`
      - `documents.hubspot_deal_id TEXT NULL`
      - FK ON DELETE: company → RESTRICT (cannot delete a company
        with documents — operator must archive), deal → SET NULL.
  - Sprint 6 frontend work:
      - Add Tabs primitive (Sprint 6 — first form library decision
        carry-over from F.5 NICE-TO-HAVE deferred).
      - `/companies/:id` consumes useCompany + useCompanyDeals +
        useCompanyDocuments (last is Sprint 4 hook).
      - `/wizard` route gets a tiny "creating draft…" splash before
        the redirect.
- Follow-up actions:
  - Sprint 3 starts on the `implement-backend` branch with the locked
    schema. Drizzle migration generated as `0003_calculator_configs.sql`.
  - Sprint 4 starts after 3 lands; migration `0004_documents.sql`
    references calculator_configs FK (numbering sequence already
    set up in Sprint 1 according to phase_08_backend_plan §3).
  - `docs/CODEMAPS/frontend.md` "Future Sprint touchpoints" section
    is now concrete: `<CalcConfigPage />`, `<CompanyDocumentsTab />`,
    `<WizardRedirectPage />`.

### Decision: Calculator save UX — explicit save, no autosave
- Date: 2026-05-17
- Context:
  - Original Phase 8 plan envisioned `/calc/:id` with debounced
    (1s) PATCH autosave and a "Saved · Xs ago" indicator — typical
    Google-Docs-style live persistence.
  - User reviewed the wireframes for the two save flows
    (calculator save + wizard Step 1 picker) and clarified the
    intended operator workflow:
    > "користувач налаштував калькулятор все перевірив і в кінці
    >  він може зберегти його за потреби явно натисне і обире до
    >  якої компанії чи діла зберегти"
  - The mental model is "calculator is a scratchpad; you commit
    it when you've finished iterating", NOT "every keystroke is
    persisted".
- Decision:
  - **Calculator save is EXPLICIT**. Operator edits calculator
    in-memory (existing CalculatorContext state), clicks "Save
    calculator" → modal opens → operator picks company + optional
    deal + optional title → `POST /api/v1/calculator-configs` →
    toast confirms.
  - **No debounced PATCH, no "Saved · Xs ago" indicator**.
    Calculator state lives in `CalculatorContext` until explicit
    save. Reload-without-save = lose changes (operator's responsibility).
  - **Updating an existing config**: opening a saved config and
    editing → clicking "Save" → PUT replaces the config's payload.
    No special "save as new" — to fork, operator opens config and
    clicks "Save as new" which prompts for new company/deal/title.
  - **Multiple drafts per (company, deal) allowed**. The schema
    has NO unique constraint on `(company_id, hubspot_deal_id)`.
    Operator can keep `Q1-Optimistic` + `Q1-Pessimistic` side-by-
    side. Wizard Step 1 picker lists them all (chronological).
  - **Wizard Step 1 config picker**:
      - Default scope: configs where `company_id = selectedCompany AND
        (hubspot_deal_id IS NULL OR hubspot_deal_id = selectedDeal)`.
      - "Show all my configs" link drops the deal filter → all
        configs for that company.
      - "Start blank" option = no seed, wizard launches with empty
        state (existing behavior).
- Alternatives considered:
  - Debounced autosave: rejected per user feedback above. The
    backend would still be simpler if added later — `PATCH
    /calculator-configs/:id` could be added as a Sprint 3.5
    addendum if the operator workflow evolves.
  - Auto-create draft on first edit, attach later: rejected.
    Would pollute the DB with abandoned drafts on every session
    where the operator just wanted to do a quick what-if.
  - Single config per (company, deal) with overwrite-on-save:
    rejected. Operators legitimately compare scenarios; throwing
    away history would force them to keep multiple browser tabs
    open.
- Consequences:
  - Sprint 3 backend gains:
      - `PUT /api/v1/calculator-configs/:id` instead of `PATCH`
        (full replace, no partial-merge).
      - `GET /api/v1/calculator-configs?companyId=…&hubspotDealId=…&showAll=…`
        for the picker.
      - No autosave debouncing logic on the frontend; just one
        button + modal + `useMutation`.
  - Sprint 3 frontend ships:
      - "Save calculator" button on `/calculator` page header.
      - `<SaveCalculatorModal />` with company typeahead (reuses
        listCompanies endpoint) + deal selector filtered to
        selected company + optional title.
      - Toast on success/error.
  - Sprint 4 (documents) is unaffected — document creation already
    requires a configId from `POST /api/v1/documents`, which the
    wizard will supply once Sprint 6 wires Step 1's picker.
  - Sprint 6 wizard Step 1:
      - Two new fields: "Attach to" (company + deal) and "Seed from
        saved calculator" (radio: blank | pick config).
      - Picker fetches via the Sprint 3 list endpoint.
- Follow-up actions:
  - Sprint 3 backend tests MUST cover the multi-draft case
    (POST two configs with same company+deal → both persisted with
    distinct ids).
  - Sprint 3 frontend tests MUST cover the modal validation:
    company REQUIRED, deal optional, title optional.
  - `docs/phase_08_implementation_plan.md` Sprint 3 section has
    been updated to reflect explicit-save model (no PATCH endpoint,
    no autosave wiring).
  - If operator feedback ever requests autosave, the backend can
    add `PATCH /api/v1/calculator-configs/:id` (partial-merge) and
    the frontend can add a debounce wrapper around it without
    breaking existing CRUD callers.

### Decision: Pre-Sprint 4 — Documents UX + payload shape + template flow
- Date: 2026-05-17
- Context:
  - Sprint 4 ships the documents + PDF module. Before writing the
    migration, locked three UX questions that touch the schema (Q2)
    and the wizard wiring (Q1, Q3).
- Decision:
  - **Q1 — Wizard "Save as document" lives ONLY on the last step**.
    The 7-step wizard runs to completion (Header → Acquirer fees →
    Volumes → ... → Parties & Signatures). On Step 7, depending on
    Document Type (offer / agreement / offer_and_agreement), the
    appropriate "Save" button(s) appear. Clicking opens AddendumModal
    → optional addendum text → POST /api/v1/documents → redirect
    to /documents/:number.
    Rejected alternatives:
      - Per-step "Save & close": would require a tristate payload
        (complete vs draft vs invalid) — explosion in validation
        rules with no business benefit, the wizard takes ~3 min and
        operators run it end-to-end anyway.
      - "Generate Document" button in the wizard header: invites
        accidental clicks mid-edit and decouples save from final
        review.
  - **Q2 — documents.payload = CalculatorSnapshotPayload + wizard-
    specific meta in ONE JSONB blob**.
    Shape:

        {
          // mirror of CalculatorSnapshotPayload (calculator-configs payload)
          schemaVersion: 1,
          calculatorType, payinVolume, ..., clientNotes,
          // wizard-specific additions (Step 1: header meta; Step 7: parties)
          header: { dateIssued, validityDays, contactPerson, ... },
          parties: {
            merchant: { legalName, regNumber, address, ... },
            bsg: { entity, signatory, ... }
          },
          signatures: { merchantSignatoryName, bsgSignatoryName }
        }

    Rationale:
      - The existing src/components/document-wizard PDF builder
        already consumes this combined shape. Splitting would create
        a join cost at render time for zero modeling benefit.
      - PDF render is read-only against payload — JSON shape mismatch
        would surface immediately in PDF QA, not silently corrupt data.
      - "Use as template" can extract the calc slice (via
        extractCalculatorSnapshot on the payload directly) without
        re-fetching the calculator-config.
    Rejected alternatives:
      - Calc snapshot + parties/signatures as separate columns:
        rejected. JSONB lets us evolve the schema (e.g. Phase 9 might
        add `localised_translations`) without migrations.
      - Pre-rendered HTML: rejected. Editing or re-styling existing
        docs requires re-rendering anyway; storing source-of-truth
        as data + rendering on demand is the standard pattern.
  - **Q3 — "Use as template" redirects to /calc/:newConfigId**, not
    /wizard. The button on /documents/:number does:
      1. POST /api/v1/documents/:number/use-as-template
      2. Backend extracts the calc slice from documents.payload,
         creates a new calculator_configs row (company_id +
         hubspot_deal_id inherited from source doc), returns
         { configId, redirectUrl: "/calc/:configId" }
      3. Frontend navigates.
    The operator then iterates on the calc, and if they want to
    produce a NEW document, opens the wizard from there as usual.
    Rejected:
      - Direct redirect to /wizard?seed=<docId>: rejected. Would
        mean a document → wizard → document cycle without a clear
        intermediate state — confusing the "what am I editing"
        mental model. Calc-as-intermediate is the cleaner break.
- Alternatives considered (cross-cutting):
  - "Save as draft" intermediate state on documents: rejected.
    Documents are immutable artefacts (an offer that's been sent to
    a client doesn't get edited; it gets superseded). Drafts live
    in calculator_configs.
  - Allowing documents.calculator_config_id NOT NULL: rejected. A
    document MAY originate from a config (Flow A) but doesn't HAVE
    to — Flow C ("direct clone from existing document") creates a
    doc without ever touching a config row.
- Consequences:
  - Sprint 4 SQL migration 0003_documents.sql locked:

        documents (
          id              UUID PK DEFAULT gen_random_uuid(),
          number          TEXT NOT NULL UNIQUE,    -- BSG-7100024 format
          company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
          hubspot_deal_id TEXT NULL REFERENCES deals(hubspot_deal_id) ON DELETE SET NULL,
          calculator_config_id UUID NULL REFERENCES calculator_configs(id) ON DELETE SET NULL,
          scope           TEXT NOT NULL CHECK (scope IN ('offer','agreement','offer_and_agreement')),
          payload         JSONB NOT NULL,
          addendum        TEXT,
          hubspot_sync_state TEXT NOT NULL DEFAULT 'not_synced'
            CHECK (hubspot_sync_state IN ('not_synced','synced','failed')),
          hubspot_note_id TEXT,
          created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        document_number_sequence (
          id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
          next_value INT NOT NULL DEFAULT 7100001
        );

    FK on company DELETE = RESTRICT (operator must archive the doc
    before removing the company; CASCADE would silently destroy
    legal-record artefacts).
    FK on deal DELETE = SET NULL (doc survives a deal deletion; the
    deal column just nulls out).
    FK on calculator_config DELETE = SET NULL (deleting a saved
    calculator-config doesn't invalidate the document; the link is
    informational).
  - Sprint 4 endpoint surface:
      - POST   /api/v1/documents               (Flow A from configId,
                                                Flow B from /use-as-template,
                                                Flow C from direct body)
      - GET    /api/v1/documents/:number
      - POST   /api/v1/documents/:number/use-as-template → new
                                                calculator-config + redirect
      - GET    /api/v1/documents?…filters     (cursor pagination)
      - GET    /api/v1/documents/:number/pdf?download=true
                                                (Puppeteer-streamed)
      - GET    /api/v1/numbering/peek
      - POST   /api/v1/documents/:number/sync → 501 stub (Phase 9)
  - Sprint 4 frontend:
      - AddendumModal (opens on wizard Step 7's Save buttons).
      - DocumentsListPage at /documents.
      - DocumentViewPage at /documents/:number (read-only render,
        Download PDF button, Use as Template button).
      - Wizard Step 7 gets one new section: "Save buttons" (per
        scope: 1, 2, or 3 buttons depending on Document Type).
- Follow-up actions:
  - Sprint 4.A migration MUST seed `document_number_sequence` with
    a single row (id=1, next_value=7100001) — see decisions.md
    "DOCUMENT_NUMBER_START=7100001".
  - Numbering allocation MUST use `UPDATE ... RETURNING` inside the
    POST /documents transaction so concurrent saves can't collide.
    Integration test required: spawn 2 parallel POSTs against the
    same company/deal, assert distinct numbers.
  - PDF render MUST be stream-only (no /tmp files, no DB cache).
    Buffer flows: Puppeteer Buffer → HTTP response.
  - Phase 9 (HubSpot Note write-back) will populate
    `documents.hubspot_note_id` + flip `hubspot_sync_state` to
    `synced`. Sprint 4 keeps the stub returning 501 so the schema
    is ready when Phase 9 lands.

### Decision: Sprint 4 — documents + PDF module shipped (A → E.fix)
- Date: 2026-05-17
- Context:
  - Pre-Sprint-4 locked decisions A2 + B2 + C1 + D3 (see earlier
    record). Sprint 4 implemented the schema + module + UI plus
    several post-smoke iterations driven by user feedback.
  - 12 commits between `dd7b46a` and the F.4 doc sync.
- Decision (high-level outcomes):
  - **Document numbering format** = `BSG-<seq:07d>-<suffix:06d>`,
    suffix = last 6 chars of `companies.hubspot_company_id`. Aligned
    with `phase_08_backend_plan.md §6`. Sprint 4.A initially shipped
    `BSG-<seq>` only and the F.1.0 round restored the suffix.
  - **Atomic allocation** via `UPDATE document_number_sequence SET
    next_value = next_value + 1 RETURNING next_value - 1` inside the
    POST /documents transaction. Failed INSERT rolls back the
    increment — no sequence gaps. Two tests cover this explicitly:
    pre-allocation validation (calc-ref fail) AND in-TX failure
    after allocation (unknown-company-UUID).
  - **Frontend wizard backend bar** lives INSIDE Step 1 (Header /
    Meta) and ONLY on that step. Save button lives ONLY on Preview
    step. Two earlier UX revisions tried bar-on-every-step and
    button-on-every-step; both were rolled back per user feedback
    ("операт перевіряє все на Preview перед save").
  - **Inline HTML preview** on `/documents/:number` uses the same
    `buildOfferPdfHtml` the wizard's Preview step renders. Iframe
    has `sandbox=""` + `allow=""` (no scripts, no permissions). The
    `asWizardPayload` shape-check is shallow; deeper validation
    surfaces as a thrown error inside `buildOfferPdfHtml` and is
    caught/rendered as a fallback banner.
  - **`?renderedHtml=` debug path** in pdf.controller is now
    `isProd`-gated. Production rejects with 403 ForbiddenError. Dev
    keeps it for manual rendering tests until Sprint 4.E.2 ships
    the shared template module.
  - **Document URL regex pre-check** (`/^BSG-\d{7}-[0-9A-Z]{6}$/i`)
    rejects malformed numbers BEFORE the DB lookup. Defends
    Content-Disposition `filename=` from CRLF injection on future
    code paths that may bypass the DB validator.
  - **LIKE metacharacter escape** in documents.repository: `q=%`
    no longer matches every row.
  - **`documents.updatedAt` `$onUpdate` hook** — Drizzle stamps
    every UPDATE so Phase 9's `patchSyncState` doesn't leave the
    column at the INSERT timestamp.
  - **`APP_PUBLIC_URL` env var** (validated against localhost in
    production) — set up now so Phase 9 has a clean place to read
    "where do we point HubSpot Notes back to".
  - **Shared `formatScopeLabel`** in `src/shared/format.ts` next to
    `formatDate` — DocumentsListPage + DocumentViewPage use it.
- Alternatives considered:
  - Storing pre-rendered HTML in `documents.payload`: rejected per
    pre-Sprint-4 lock (Q2 → B option). The current approach renders
    on demand from a structured payload — supports re-styling without
    re-saving documents.
  - Per-step Save buttons: rejected. Operator must complete the
    full wizard + preview before committing — single save trigger.
  - Server-side Puppeteer PDF render in Sprint 4: BACKEND PLUMBING
    SHIPPED but the `buildOfferPdfHtml` builder still lives only on
    the frontend. Sprint 4.E.2 will extract a shared template module
    so the server can call it. Until then, `Download PDF` is
    explicitly disabled on the UI with a tooltip noting Sprint 4.E.2.
- Consequences:
  - Backend: +1 module (documents), +1 module (pdf), +1 migration
    (0003), +1 error class (NotImplementedError), +1 env var
    (APP_PUBLIC_URL). 183 server tests (was 146 pre-Sprint-4).
  - Frontend: +3 pages (DocumentsListPage, DocumentViewPage),
    +2 modals (SaveDocumentModal, WizardBackendBar), +1 hook
    (useDocuments), +1 formatter (formatScopeLabel). 243 frontend
    tests (was 211 pre-Sprint-4).
  - 28 audit findings closed in F.1 (correctness — 1 BLOCKER + 9
    SHOULD-FIX), F.2 (refactor + APP_PUBLIC_URL + iframe allow=""),
    F.3 (test coverage). Zero open findings.
- Follow-up actions:
  - Sprint 4.E.2 (shared template module): pick approach (a) move
    `src/components/document-wizard/buildOfferPdfHtml.ts` + deps to
    `src/shared-templates/` and include in `tsconfig.server.json`,
    OR (b) Vite library-mode build. Pre-commit comment in
    `pdf.controller.ts` flags this for the implementing engineer.
  - Sprint 5 (HubSpot webhooks): inbound only. Backend `documents`
    schema already has `hubspot_sync_state` + `hubspot_note_id`
    placeholders for Phase 9's outbound write-back.
  - Phase 9 (HubSpot Note write-back): will use `APP_PUBLIC_URL +
    "/documents/" + number` as the link payload. Env validator
    enforces the URL is a real https origin in production.
  - WizardBackendBar + SaveDocumentModal frontend tests deferred
    to Sprint 6 polish (mirror SaveCalculatorModal pattern).

### Decision: Pre-Sprint 5 — HubSpot webhooks scope + filter behaviour
- Date: 2026-05-17
- Context:
  - Sprint 5 backend scope = inbound HubSpot webhooks. Phase 9 will
    later add outbound Note write-back. Locking event-type coverage
    + filter behaviour BEFORE writing the migration so the worker
    + processor design knows what to expect.
- Decision:
  - **Event types covered** = `company.creation`, `company.propertyChange`,
    `company.deletion`, `deal.creation`, `deal.propertyChange`,
    `deal.deletion`. Full set; nothing deferred.
    Deletion handling: incoming `deletion` event triggers a hard
    DELETE on `companies` (or `deals`) by HubSpot natural key. FK
    policies (already locked in earlier records): deals FK on
    company.hubspotCompanyId is RESTRICT — but the webhook
    processor runs the deletes IN ORDER: deals first, then their
    company. The processor MUST handle `404` from HubSpot fetches
    on deletion events (HubSpot's API returns 404 after the row is
    gone) — treat 404 as "delete in our DB and ack".
  - **Storage filter sync** = drop-on-event. Webhook processor
    fetches the full object from HubSpot, checks `properties.company_type`
    against `HUBSPOT_COMPANY_TYPE_FILTER`:
      - If MATCH (e.g. `direct_client`) → upsert into `companies` row.
      - If MISMATCH (e.g. Agent / NULL) → mark event as
        `processed` with `outcome = 'filtered_out'`, do NOT upsert.
      - The same backfill cleanup pass that runs at server startup
        re-aligns the DB if the filter is ever loosened/tightened.
    For deals: deals are saved as long as their parent company
    passes the filter (the existing backfill skip path already
    handles this case).
  - **Async processing model** = receiver inserts a row into
    `hubspot_webhook_events` and immediately returns 200. A worker
    loop (`setInterval` every 5s in-process — single replica until
    Sprint 7) polls pending rows, fetches the object from HubSpot,
    runs the upsert/filter, marks the row as `processed` or
    increments `attempts` + sets `last_error`. Idempotency via
    UNIQUE on `hubspot_event_id` (HubSpot delivers each event a
    handful of times; `ON CONFLICT DO NOTHING` makes the receiver
    side trivially idempotent).
- Alternatives considered:
  - Synchronous processing (verify HMAC → fetch from HubSpot →
    upsert in the request): rejected. HubSpot ack timeout is 30s;
    a slow upstream HubSpot or a temporary rate-limit hit could
    cascade into "HubSpot retries the event, we re-process, etc."
    Async with idempotent insert is the standard pattern.
  - Store all events even for non-matching companies: rejected for
    DB hygiene. `outcome = 'filtered_out'` rows are still kept
    (audit trail), they just don't touch `companies`/`deals`.
  - Per-company-type webhook subscriptions in HubSpot: rejected.
    HubSpot's webhook subscription model is global per Private App,
    not filterable by company-type. Easier to filter at receive
    time than to maintain N separate subscriptions.
- Consequences:
  - Sprint 5 schema: `hubspot_webhook_events` table with columns:
      - `id` UUID PK
      - `hubspot_event_id` TEXT NOT NULL UNIQUE (idempotency)
      - `subscription_type` TEXT NOT NULL (company.creation, etc.)
      - `object_type` TEXT NOT NULL ('company' | 'deal')
      - `hubspot_object_id` TEXT NOT NULL (the company/deal id)
      - `occurred_at` TIMESTAMPTZ NOT NULL (from event payload)
      - `received_at` TIMESTAMPTZ DEFAULT now()
      - `status` TEXT NOT NULL DEFAULT 'pending'
        (CHECK: pending | processed | failed)
      - `outcome` TEXT NULL (CHECK: upserted | deleted | filtered_out | null)
      - `attempts` INT NOT NULL DEFAULT 0
      - `last_error` TEXT NULL
      - `processed_at` TIMESTAMPTZ NULL
      - `raw` JSONB NOT NULL (the full event body for debugging)
  - Index: partial index on `(status)` WHERE status = 'pending' —
    the polling worker's hot path.
  - Sprint 5 endpoint surface:
      - POST `/api/v1/hubspot/webhooks` (HMAC-protected; rate-limited
        via `webhookLimiter` 200/min/IP from Sprint 2.7)
      - POST `/api/v1/hubspot/refresh` (auth-protected; manual sync
        trigger for operators)
  - New worker boot in `server/index.ts`: `startWebhookProcessor()`
    after backfill hook. `setInterval(5000)` polling.
- Follow-up actions:
  - Sprint 5 implementation broken into A (migration + schema),
    B (HMAC middleware + receiver), C (worker + processor),
    D (refresh endpoint + integration tests), E (docs).
  - HubSpot Private App webhook configuration → goes into
    `docs/hubspot_api_reference.md` so a future operator can set
    up webhooks without rediscovering the steps.
  - Sprint 7 (Docker) needs to handle the worker's `setInterval` —
    single-replica deploy is fine; multi-replica future would
    need a row-lock or a Redis-backed queue. Note as TODO.

### Decision: Sprint 5 — HubSpot webhooks shipped (A → E)
- Date: 2026-05-17
- Context:
  - Pre-Sprint 5 locked the scope (all 6 event types, drop-on-event
    filtering, async receiver + worker, idempotency via UNIQUE on
    `hubspot_event_id`). This record captures what landed plus the
    one architectural deviation we encountered during wiring.
- Decision (what shipped):
  - **Migration `0004_complex_squadron_sinister.sql`** — created
    `hubspot_webhook_events` (12 columns + partial index on
    `(status)` WHERE status='pending' + 3 CHECK constraints encoding
    the status / outcome / object_type enums inline).
  - **HMAC v3 middleware** (`server/middleware/verify-hubspot-signature.ts`).
    Source string = `${method}${uri}${rawBody}${timestamp}`,
    `crypto.timingSafeEqual`, 5-minute timestamp window.
    Decoded raw body is re-parsed into `req.body` so downstream
    handlers see the same JSON shape as every other endpoint.
  - **Receiver + refresh routes** mounted as
    `hubspotWebhooksRouter` inside the existing `hubspotRouter`:
      - `POST /api/v1/hubspot/webhooks` — public (signature-auth),
        `webhookLimiter` 200/min/IP, returns 200 even on shape
        mismatch (logs + `malformed:true` so HubSpot doesn't retry).
      - `POST /api/v1/hubspot/refresh` — Bearer-auth,
        `hubspotProxyLimiter` 10/min/IP, max 100 ids.
  - **Async processor** (`webhooks.processor.ts`) —
    `setInterval(5000)` in-process, `BATCH_SIZE=50`,
    `MAX_ATTEMPTS=5`. Skipped in `NODE_ENV=test` so the test suite
    can drive it via `processWebhookBatch()` directly. Stop hook
    runs before DB pool drain in `shutdown()`.
  - **HubSpot 404 race protection** — a `creation`/`propertyChange`
    event whose object has already been deleted in HubSpot
    surfaces as `NotFoundError` from `hubspot.getCompany` /
    `getDeal`. We catch it and treat as a delete (so the local
    DB stays consistent without re-queuing the event forever).
  - **Drop-on-event filter** — `passesCompanyTypeFilter()` enforces
    `HUBSPOT_COMPANY_TYPE_FILTER` against `properties.company_type`.
    Non-matching → outcome=`filtered_out`, no upsert.
  - **Deal-without-parent** — if a deal event fires for a deal
    whose parent company isn't in our cache, we mark it
    `filtered_out` and skip — preventing a FK insert error. The
    next company event for the parent (or a manual refresh) will
    backfill the missing company; the deal will be picked up via
    the future propertyChange or a backfill rerun.
- Architectural deviation (from Pre-Sprint 5):
  - **Raw body parser mount location** — Pre-Sprint 5 implied the
    raw parser would be route-scoped inside the webhooks router.
    In practice this didn't work: `app.use(express.json())` is
    mounted globally in `app.ts` and consumes the body BEFORE the
    route-level `express.raw` ever runs. Fix: mount `express.raw`
    path-scoped at `/api/v1/hubspot/webhooks` BEFORE
    `express.json()`. body-parser's `_body` sentinel makes the
    second parser a no-op once the first has consumed the stream.
- Test coverage:
  - 22 integration tests in `server/tests/hubspot-webhooks.integration.test.ts`:
      - Receiver: missing sig (403), tampered sig (403), stale ts
        (403), valid payload (200 + DB row), dedup (200 with
        deduped=1), malformed payload shape (200 with
        malformed=true), unsupported subscription type
        (200 with malformed=true).
      - Processor: creation → upsert, propertyChange → upsert,
        filtered_out (non-direct_client), deletion (no HubSpot
        fetch + cascades to deals), HubSpot 404 race, transient
        failure (attempts++), retry budget exhaustion
        (`status='failed'`), deal-with-parent vs deal-without-parent,
        `occurredAt` ASC ordering.
      - Refresh: 401 unauth, 400 too-many ids, 400 non-UUID,
        happy path (refetch + upsert), missing local row (counted
        as failed).
  - Full suite: 204 tests pass.
- Follow-up actions / TODOs:
  - **Sprint 7 (Docker)** — the `setInterval(5000)` worker is
    single-replica safe. If we ever run >1 replica, swap to
    pg advisory locks or a Redis-backed queue. Add to deployment
    runbook in `docs/deployment.md` once Sprint 7 ships.
  - **Operator UI** — `POST /api/v1/hubspot/refresh` has no UI
    surface yet. Sprint 6+ may add a "Force resync" button on a
    future Companies admin page.
  - **HubSpot Private App webhook setup** — documented in
    `docs/hubspot_api_reference.md` (URL + secret + subscription
    list) so the operator can finish the connection at deploy time.

### Decision: Sprint 5.5 — Visual-diff harness (frontend vs. backend PDF)
- Date: 2026-05-17
- Context:
  - User asked the load-bearing question: "are the two PDF
    rendering paths (frontend wizard 'Generate PDF' vs. backend
    `GET /api/v1/documents/:number/pdf`) producing byte-for-byte
    equivalent output for the same payload?" Until Sprint 5.5
    nothing checked this — Sprint 4.E.2 shared the HTML builder
    but the render engines differ (browser-native print pipeline
    vs. Puppeteer `page.pdf()`).
- Decision:
  - Build an automated visual-diff harness
    (`scripts/visual-diff/index.ts`). It uses Puppeteer for both
    renders with two different settings configs that approximate
    the two production paths:
      - **backend**  — exact production `renderHtmlToPdf()` with
        `preferCSSPageSize: true` + explicit margins
      - **frontend simulated** — `page.pdf({ format: "A4",
        printBackground: true })` with no preferCSSPageSize/margin,
        approximating window.print() → Save as PDF defaults
  - Compares per-page via `pixelmatch` after `pdftoppm` rasterisation
    at 100 DPI. Threshold 0.5% pixel drift per page.
  - Two fixtures land: `offer-only` (2 pages) and
    `offer-and-agreement` (12 pages — bundle scope with the MSA
    appendix).
- **Result**:
  - All pages within budget by a 200× margin.
    - Offer-only: 19 px diff / 967k (0.002%) per page.
    - Bundle: 14–26 px diff / 967k (≤0.003%) per page.
  - The handful of differing pixels are anti-aliasing artifacts
    from `pdftoppm` rounding adjacent renders of the same A4
    geometry at different sub-pixel positions. Not visible to a
    human eye.
  - PDF byte sizes are within 4–25 bytes of each other (PDF
    metadata only; the content streams are identical).
  - **Conclusion**: backend and frontend PDF paths produce
    visually equivalent output, with backend being the canonical
    reference because it's deterministic across browsers.
- Caveats documented (in `scripts/visual-diff/README.md` and the
  operator-facing `docs/hubspot_api_reference.md` workflow notes):
  - Users on Safari/Firefox may see slightly different output
    (kerning, page-break heuristics). Recommend "Download PDF"
    button on `/documents/:number` for any contract delivered to a
    counterparty.
  - If the user enables "Headers and footers" in the browser print
    dialog, their browser injects URL + timestamp on each page.
    Backend output never has this.
  - Browser version drift (user on a much older Chrome than
    Puppeteer's bundled one) — not testable in CI.
- Alternatives considered:
  - Drop the frontend "Generate PDF" button entirely, force
    everyone through backend Download. Rejected — the wizard's
    in-browser print is a useful "preview-before-save" affordance,
    especially during pricing iteration.
  - Use Playwright on three browsers (Chrome / Safari / Firefox)
    in CI. Deferred — adds ~30s to every CI run for marginal
    coverage given the dominant operator browser is Chrome.
  - Bytewise PDF diff. Rejected — PDF metadata (creation date,
    object IDs) always differs even when content matches; pixel
    diff is a more honest signal.
- Consequences:
  - `npm run visual-diff` is the CI gate going forward. Any template
    change requires regenerating gold files via
    `npm run visual-diff:gold` and reviewing the diff in code
    review.
  - `tests/visual-diff-gold/` is committed; `tests/visual-diff-output/`
    is gitignored.
  - Sprint 8 (hardening) can extend this with Playwright multi-
    browser support if real-world variation reports come in.
- Follow-up actions:
  - Wire `npm run visual-diff` into the `verify` script once the
    backend dev DB is part of CI. For now operators run it locally
    when touching the PDF template.

### Decision: Sprint 5.F — audit closure (30 findings)
- Date: 2026-05-17
- Context:
  - Post-Sprint 5 + Sprint 5.5 audit by 5 parallel specialist agents
    (architect, security-reviewer, typescript-reviewer,
    database-reviewer, code-reviewer). 30 unique findings after
    de-duplication: 2 BLOCKER (build/runtime), 5 HIGH (safety),
    12 SHOULD-FIX (design/coverage), 11 NICE (polish).
- Decision: close all 30 across three commits.
  - **5.F.1 (commit `02149a5`) — BLOCKER + HIGH (7 items).**
    Build broken on tsc: visual-diff `waitUntil:"networkidle0"` is
    SetContentWaitForOptions-rejected, fixture-payload barrel import
    drags React .tsx into server tree, pngjs untyped. Replaced HMAC
    URI source with `env.APP_PUBLIC_URL` (was proxy-header derived).
    Cut refresh `companyIds.max` from 100 → 20 (was 1000 HubSpot
    calls/min/IP). Wrapped company-deletion path in `db.transaction`.
    Replaced `setInterval` with self-rescheduling `setTimeout` +
    `processorRunning` flag to eliminate re-entrancy race. Wired
    real exponential backoff in `listPendingEvents` WHERE clause
    (`attempts = 0 OR received_at + attempts × 30s ≤ now()`) so a
    failing row no longer exhausts its 5-attempt budget in 25 seconds.
  - **5.F.2 (commit `6da59ef`) — SHOULD-FIX (12 items).**
    Repository boundary restored: webhook controller no longer uses
    dynamic `await import()` of db/schema/eq inside a per-id loop;
    routes through `findCompanyById`. Processor stops issuing raw
    `db.delete(deals)`/`db.delete(companies)` and instead calls
    new helpers (`deleteDealsByCompanyId`, `deleteCompanyByHubspotId`,
    `deleteDealByHubspotId`, `findCompanyByHubspotId`) that accept
    an optional `tx` handle so the company-deletion path composes
    with its TX. Partial index expanded from `(occurred_at)` to
    `(occurred_at, received_at, attempts) WHERE status='pending'`
    via migration `0005_strong_thor.sql` so the new backoff WHERE
    clause can do an index-only scan. SSRF defence-in-depth: Zod
    schema now constrains `eventId` + `objectId` to `/^\d{1,19}$/`.
    Five identical `companyFixture()` copies consolidated into
    `server/tests/fixtures/company.ts`. Added missing
    `deal.deletion` + `deal.propertyChange` processor tests (2 of 6
    subscription types had zero coverage). Fixed `isWizardPayload`
    null-pass bug (`typeof null === "object"`). Dropped `as object`
    cast in `eventToRow`. Made `dropped` field in malformed ack
    reflect the real array length instead of hardcoded `0`.
    - **5.F.2 deferral (S3)**: moving the PDF builder out of
      `src/components/document-wizard/` to `src/shared/pdf-templates/`
      would touch ~30 wizard React files and we lack E2E coverage to
      verify a clean cut. Filed as a future refactor with an
      architecture note at the pdf.controller.ts import site so the
      next developer sees the rationale. The visual-diff harness
      would catch a rendering regression, but a wizard-React hydration
      bug would slip through silently — wait for Sprint 8 E2E
      Playwright tests before attempting the move.
    - **5.F.2 known gap (S6)**: any authenticated user can refresh
      any company via POST /api/v1/hubspot/refresh — no per-resource
      ownership check. INTENTIONAL pre-RBAC (Sprint 2.8 ships
      flat-auth). When admin/regular-user roles ship (Phase 9+),
      gate refresh on `admin` role before any per-resource check
      would matter. Documented in JSDoc on the controller.
  - **5.F.3 (this commit) — NICE polish (11 items).**
    Five items landed as freebies in F.1/F.2 (`id` tie-breaker in
    ORDER BY, JSDoc rewrite on listPendingEvents, processor:120
    projection rename via repo helper, req.protocol → env constant).
    Remaining 6 done here:
      - Application-side 64 KB cap on `raw` JSONB persisted by the
        receiver; over-budget bodies stored as a `_truncated` marker
        so the row stays inspectable without bloating the table.
      - Per-fixture `maxDiffRatio` override in the visual-diff
        FIXTURES registry (default still 0.5%).
      - Combined duplicate import statement from browser-pool in
        visual-diff/index.ts.
      - Receiver log line `events queued` now includes
        `companies` + `deals` breakdown so a delivery storm is
        triagable at a glance.
      - Pre-flight check on `pdftoppm` availability with a clear
        install hint, replacing the previous unactionable ENOENT.
      - Defence-in-depth comment on the raw body parser scope in
        app.ts warning future contributors NEVER to broaden the
        path argument (would shadow JSON parser globally).
- Verification:
  - Server typecheck: clean.
  - Server test suite: 209 tests pass (was 206; +3 from S7 +
    S12 + retry-backoff). One pre-existing order-dependent flake
    in companies-deals cursor pagination is unrelated to 5.F.
  - Webhook integration tests: 27 pass (was 22 in Sprint 5 ship;
    +5 from F.1 + F.2.b).
  - `npm run visual-diff`: 14-26 px / 967k drift per page,
    within the 0.5% threshold by a 200× margin (unchanged).
- Open follow-ups (NOT closed in 5.F):
  - **S3 PDF-builder move** — Sprint 8 (after E2E lands) or
    Phase 9 prep (before outbound Note write-back wants the same
    builder).
  - **RBAC for refresh endpoint** — Phase 9+ once user roles ship.
  - **Multi-replica processor** — Sprint 7 single-replica is fine.
    Multi-replica needs pg advisory locks or Redis-backed queue.
  - **Path alias setup** — tsconfig.json/server.json + vite +
    vitest + tsx all need new resolution config. Not worth the
    plumbing until at least 2 cross-boundary imports exist.
- Sprint 5.F is closed. Next sprint per `phase_08_implementation_plan.md`
  status snapshot is Sprint 6 (frontend continuation:
  `/calc/:id` hydration + auto-save + global toasts) or Sprint 7
  (Docker + Coolify deploy).

### Decision: Sprint 6 — frontend polish + PDF unification (6.0 → 6.4)
- Date: 2026-05-18
- Context:
  - Sprint 6 closed the last operator-facing UX gaps after the
    Sprint 5 backend was complete: PDF render engine split between
    frontend window.print() and backend Puppeteer (5.5 visual-diff
    acknowledged the variability), saved calculator configs had no
    "open this back up" flow, and per-page inline toasts were
    inconsistent across the app.
- Decision (what shipped):
  - **6.0 unified PDF render** — new `POST /api/v1/pdf/preview`
    backend endpoint takes a wizard payload and renders via the
    same Puppeteer pipeline as `GET /documents/:number/pdf`. The
    wizard's "Generate PDF" button now calls this endpoint via
    axios arraybuffer + Blob URL (same pattern as saved-doc
    download). Removed `src/lib/printHtmlViaIframe.ts`. Single
    render engine across all PDF paths → Sprint 5.5 caveats
    (Safari/Firefox variability, browser-injected headers) are
    moot.
  - **6.1 /calc/:id edit mode** — new route reuses CalculatorPage
    with `useParams<{ id }>`. Hydrates live state via
    `seedCalculatorStateFromSnapshot` + `applyStatePreset`,
    auto-saves on debounced (1s) snapshot diff via
    `useUpdateCalculatorConfig`. "Saved · 2s ago" SavedStatusBadge
    surfaces mutation state. Hydration guard via `hydratedFromIdRef`,
    auto-save arm via `autoSaveArmedRef` with mandatory reset on
    configId change (Sprint 6.F.1 audit fix).
  - **6.2-FIX wizard-from-calc linking** — original 6.2 added
    "Save as Offer" / "Save as Offer + Agreement" buttons directly
    on the calc page; user flagged the naming as misleading (calc
    isn't being CONVERTED into an offer — it spawns multiple
    documents over its lifetime). Reverted; wizard is now the
    SOLE document-creation gateway. `/calc/:id` "Open Contract
    Wizard" passes `?calc=<configId>` so the wizard:
      - Hydrates CalculatorContext from the linked config
        (covers deep-linking to /wizard?calc=<id>)
      - Auto-selects company + deal in WizardBackendBar
      - Forwards `calculatorConfigId` to SaveDocumentModal →
        `POST /documents` → backend persists FK link
  - **6.3 global toasts** — new src/contexts/ToastContext.tsx
    (~190 LOC, no library deps). Replaces per-page inline
    `savedToast` / `pdfError` / `templateError` state in
    CalculatorPage, WizardPage, DocumentViewPage. Auto-dismiss with
    kind-specific timeouts (success/info 4s, error 6s). aria-live
    + role=alert wiring for accessibility. ToastProvider wraps
    AuthProvider in main.tsx + renderApp test harness.
  - **6.4 lists + tabs** — new useCalculatorConfigs(opts) infinite
    query hook. CompanyDetailPage rewritten into 3-tab layout
    (Deals / Saved calculators / Documents) with `?tab=` URL state.
    "Documents from this calculator" history section on /calc/:id.
    Backend extended: listDocumentsQuerySchema accepts
    `calculatorConfigId` filter, propagated through repository
    WHERE clause for the docs-from-this-calc history view.
- Sprint 6.1 hotfix (commit `5047e22`):
  - "Maximum update depth exceeded" surfaced on /calculator after
    bouncing through /calc/:id. Root cause: `savedAt` state used
    `new Date(string)` in an effect — new Date object each fire,
    Object.is bail-out failed, setState fired, effect re-ran. Fixed
    by deriving `savedAtIso` (string) directly from
    updateMutation.data + configQuery.data instead of storing in
    useState. Cascading fixes: `calc` removed from hydrate-effect
    deps (use applyStatePresetRef pattern), liveSnapshot converted
    to JSON string for stable debouncedValue comparison.
- Sprint 6.F audit (4 parallel agents — typescript, code-reviewer,
  architect, security):
  - **15 findings** consolidated: 1 HIGH + 2 CORRECTNESS + 8
    SHOULD-FIX + 4 NICE.
  - **Sprint 6.F.1** closed HIGH + correctness:
      - H1 dedicated `pdfPreviewLimiter` (10 req/min/IP) on
        POST /pdf/preview — prevents single user from monopolising
        the shared Puppeteer browser pool and DoS'ing PDF gen for
        everyone else.
      - C1 `autoSaveArmedRef` reset on configId change — prevents
        first-debounced-snapshot-for-B from silently overwriting
        the stored row with hydration-time defaults.
      - C2 ToastContext `notify` stale-closure fix — inlined id
        construction inside the useCallback body.
      - Q1 dedupe DocumentViewPage.handleDownloadPdf to call
        `downloadSavedPdf` + `triggerPdfDownload` from src/api/pdf.ts.
      - U1+U2 user-facing error strings tightened (removed raw
        UUID from "calculator not found" banner; clearer fallbacks
        on PDF/template errors).
  - **Sprint 6.F.2** closed decomposition:
      - Extracted CalculatorPage edit-mode subcomponents
        (`BannerStatus`, `SavedStatusBadge`,
        `DocumentsFromCalcSection`) to
        `src/components/calculator/edit-mode/`. Page file
        679 → 561 LOC.
  - **Sprint 6.F.3** closed tests + runtime guards:
      - T1 added 2 integration tests for the Sprint 6.4
        `?calculatorConfigId=` filter on listDocuments.
      - Q3 `isCalculatorSnapshotPayload` runtime guard in
        snapshotShape.ts; applied to both CalculatorPage +
        WizardPage hydration paths before the cast.
  - **Sprint 6.F.4** closed polish:
      - Q2 stale "Sprint 6.4 WILL add" → past tense JSDoc.
      - N3 wizard refs renamed (`linkedHydratedFromRef` →
        `hydratedCalcStateForRef`, `linkedBarSeededRef` →
        `seededBarTargetForRef`) + comment documenting why the
        split is intentional.
      - N4 `npm run visual-diff` re-verified — ≤0.003% pixel drift
        unchanged after Sprint 6 changes, gold files current.
  - **Deferred from Sprint 6.F** (4 findings, documented rationale):
      - D2 WizardSeedSource discriminated union — premature with
        one source type. Lands when Phase 9 "Use document as
        template" adds `?fromDoc=`.
      - T2 CompanyDetailPage tabs test + T3 /calc/:id edit-mode
        test — flagged as follow-up; manual smoke is sufficient
        for the simple tab-switch + hydration paths.
      - S3 PDF builder move from `src/components/document-wizard/`
        to `src/shared/pdf-templates/` — still waiting on Sprint 8
        E2E per Sprint 5.F.4 rationale.
      - N1 per-route payload size cap on /pdf/preview — global
        1MB limit + 10 req/min rate-limit (F.1) already bound the
        realistic worst case. Tune if observed in prod.
- Verification:
  - 243 frontend tests pass.
  - 215 server tests pass (+2 from F.3 calculatorConfigId filter
    coverage; pre-existing hubspot.client retry-race flake
    documented in Sprint 5.F.4 still occasional).
  - TypeScript clean (frontend + server).
  - `npm run visual-diff` ≤0.003% drift.
- Open for Sprint 7:
  - Docker + Coolify deploy + public domain.
  - HubSpot Private App webhook config (uses Sprint 5 receiver +
    Sprint 5.F.1 HMAC URI hardening).
- Open for Sprint 8 (optional hardening):
  - E2E Playwright tests — unlock deferred S3 PDF builder move.
  - WizardSeedSource refactor when Phase 9 needs it.

### Decision: Phase 8 Stage 1 — hierarchical role enum (2026-05-21)

- Context:
  - `users.is_admin boolean` could not express a third tier needed
    for the Phase 8 super-admin user-management surface (see
    `docs/phase_8_security_admin_audit.md`). A single boolean also
    couldn't represent the `user` tier introduced by the same
    spec — accounts with view-only access to documents.
- Decision:
  - Migrate to a hierarchical `role` enum (`user` ⊂ `admin` ⊂
    `super_admin`). Replace `is_admin: boolean` everywhere with
    `role: UserRole`. Migration 0007 backfills existing
    `is_admin=true` rows to `role='admin'`.
  - JWT access token carries `role` (not `isAdmin`). Stale
    pre-migration tokens surface as
    `AccessTokenVerificationError("invalid")` so the FE refresh
    pipeline picks up the new shape within 15 min (access TTL).
  - New `requireRole(min)` middleware with a numeric tier table
    (user=0, admin=1, super_admin=2). `requireAdmin()` becomes a
    thin shim over `requireRole('admin')` to avoid churning every
    existing route file in the same commit.
  - `BOOTSTRAP_SUPER_ADMIN_EMAIL` env: optional, when set the
    matching user is promoted to `super_admin` on every server
    boot. Idempotent, never demotes — clearing the env doesn't
    strip privileges.
  - Frontend `useAuth().hasRole(min)` helper mirrors the backend
    tier table so a `role !== 'admin'` typo can't accidentally
    miss `super_admin`.
- Trade-off:
  - Stale JWT tokens (issued before Stage 1 deploy) are invalidated
    on the next request — operators see a single refresh hiccup
    after deploy. Acceptable: 15-min access TTL + refresh-cookie
    chain handles it transparently.
- Consequence:
  - Stages 2–6 of Phase 8 can now gate UIs on `hasRole('admin')`
    or `hasRole('super_admin')` without further schema work.
  - Future tier insertion (e.g. `viewer` between `user` and
    `admin`) only requires adding the row to `USER_ROLES` const
    + the `ROLE_TIER` table (both frontend and backend) + a
    migration to widen the CHECK constraint.

### Decision: Phase 9.K — Calc Sync uses PATCH (one Note per calc, no spam) (2026-05-21)

- Context:
  - Phase 9.I introduced HubSpot Note write-back for calc-configs
    using the same CREATE-each-time policy as documents. Operators
    pressing the manual Sync button on `/calc/:id` more than once
    saw their HubSpot Activity feed clutter with duplicate Notes
    pointing at the same calc.
  - The documents flow is intentionally CREATE-each-time: every
    `POST /documents` is a frozen point-in-time artifact (a signed
    Offer / Agreement) and the audit trail is a feature. Calculators
    are LIVING drafts the operator iterates on; the Note's `Link`
    opens our SPA which already renders the freshest state.
- Decision:
  - Switch the calc-config sync to PATCH-first:
      - If `hubspotNoteId IS NOT NULL` AND last `hubspotSyncState ===
        'synced'` → `PATCH /crm/v3/objects/notes/:id` (refreshes the
        body in place; the original association persists).
      - Otherwise → `POST /crm/v3/objects/notes` + association (first
        sync, or recovery after a previous failure that left the
        prior noteId stale).
      - If PATCH returns 404 (operator deleted the Note manually in
        HubSpot UI) → self-heal: fall back to CREATE so the next
        Sync click restores a working association.
  - Documents stay on the CREATE-each-time policy. Each document is
    its own committed artifact; the audit chain matters.
- Trade-off:
  - The PATCH path silently overwrites the previous Note body. We
    accept that — the body is recomputed from the calc's current
    state and the operator never sees the prior version anyway.
  - A pathological race (two concurrent manual Sync clicks for a
    not-yet-synced calc) could create duplicate Notes. Addressed in
    Sprint 9.L below.
- Consequence:
  - HubSpot Activity feed for a heavy-use calc stays a single Note.
  - The `hubspot_note_id` column always points to the LIVE Note;
    no stale-pointer reconciliation needed on read.

### Decision: Sprint 9.L — Phase-9 audit closure (2026-05-21)

- Context:
  - End-of-Phase-9 audit (4 parallel review agents — Phase 9
    correctness / Phase 8 correctness / decomposition / security)
    surfaced 22+ findings spanning bugs (5), decomposition (7),
    test gaps (4), and polish (8).
  - Operator confirmed full scope ("Повний") before opening
    Stage 5 (admin documents tab) so the new code lands on a clean
    foundation rather than compounding tech debt.
- Decision (bug fixes — applied):
  - **B1** `hubspot.client.createNote` no longer retries on 5xx.
    POST `/crm/v3/objects/notes` is not idempotent — retry-on-5xx
    could create duplicate Notes when HubSpot already accepted the
    first write but returned a gateway error. PATCH / DELETE keep
    the default retry behaviour (idempotent by HTTP semantics).
  - **B2** `documents.service.createDocument` hoists `setImmediate`
    OUT of the open transaction. Was inside the `db.transaction(...)`
    callback — a fast Node tick could fire the sync before drizzle's
    COMMIT round-trip, so `findByNumber` saw no row and marked the
    doc `state='failed'` even though it landed cleanly.
  - **B3** Note body URL escape: introduced `escapeUrlAttr` (only
    `"` + `&`, per HTML5 spec) for the `<a href="…">` attribute.
    Previous `escapeHtml(absUrl)` over-escaped (`'` → `&#39;`).
    Latent — current paths have no query strings — but the cleaner
    helper guards future `?from=…` paths.
  - **B4** Calc-config sync TOCTOU race: serialize concurrent Sync
    clicks for the same calc via Postgres advisory transaction lock
    (`pg_try_advisory_xact_lock(hashtext('calc-sync:' || id))`). A
    second concurrent click gets `409 HUBSPOT_SYNC_IN_PROGRESS`
    rather than starting a duplicate flow. Companion to Phase 9.K.
  - **B5** Error-handler scrubs `HubspotUnreachableError.details.url`
    before responding 502. The upstream URL stays in the structured
    log line (ops debugging) but never leaks to the client.
- Decision (decomposition — applied):
  - **D1** `ensureDealBelongsToCompany` extracted to
    `server/shared/deal-guard.ts` (was duplicated across documents +
    calc-configs services).
  - **D2** `escapeHtml` + `escapeUrlAttr` extracted to
    `server/shared/html.ts` (was inlined in the Note builder; the
    frontend already had a sibling at `src/shared/html.ts`).
  - **D3** Note builder moved to `server/shared/hubspot/note-builder.ts`
    (out of `modules/documents/` because Phase 9.I made it
    cross-module — both documents AND calc-config sync consume it).
  - **D4** Env flag renamed `AUTO_SYNC_DOCUMENTS_TO_HUBSPOT` →
    `AUTO_SYNC_TO_HUBSPOT`. The old name is still read as a
    fallback at env-parse time so existing prod `.env` files don't
    break. Old name retired on next rotation.
  - **D5** Deleted `middleware/require-admin.ts` shim. Only caller
    (`users.routes.ts`) now uses `requireRole('admin')` directly.
  - **D6** Extracted `ROLE_TIER` + `hasRoleAtLeast` helper to
    `server/shared/roles.ts` + `src/shared/roles.ts`. The two trees
    intentionally mirror (no shared bundle between Vite and tsx);
    new tier additions update both files.
  - **D7** Sync-helpers extraction deferred — the existing
    try/catch + persist-failed-state pattern is short enough that
    extracting risks bigger refactor surface than it pays back.
- Decision (tests — applied):
  - **T1** `useAuth().hasRole` covered with a full 3×3 actor×min
    matrix + logged-out case. Standalone unit tests for the
    `src/shared/roles.ts` and `server/shared/roles.ts` helpers
    document the role-tier semantics.
- Decision (polish — applied):
  - **N1** Removed unused `formatDate` (date-only) helper from
    `src/shared/format.ts` — every call site uses `formatDateTime`.
  - **N2** Removed unused `CalculatorHeader` (Sprint 7.1) and
    `CalculatorActionsPanel` (Sprint 7.2) exports — both were
    `@deprecated` for two sprints with no remounts.
  - **N3** `server/scripts/create-user.ts` JSDoc updated from
    `is_admin = true` (pre-Stage-1 boolean) to the
    `--role={user|admin|super_admin}` shape.
  - **N5** `middleware/require-auth.ts` now has an explicit comment
    documenting that `req.user.role` is read from the live DB row
    (not the JWT claim) so a role demotion takes effect on the
    NEXT request rather than after the 15-minute access TTL.
- Trade-off:
  - The advisory-lock approach to B4 holds a Postgres transaction
    around the entire HubSpot round-trip. Acceptable for the
    operator-driven Sync use case (low concurrency, low frequency);
    revisit if Sync becomes a hot path.
  - The `AUTO_SYNC_TO_HUBSPOT` rename keeps the old env name working
    "forever" via a back-compat shim. Plan to drop the old name on
    the next major env-config rotation so the schema stays minimal.
- Consequence:
  - Phase-9 surface is internally consistent and reviewed end-to-end.
  - 273 frontend tests pass; server typecheck clean. Server
    integration tests need DB up (docker compose dev) to run —
    verified via the test setup the prior sprint.
  - Stage 5 (admin documents tab) opens against a stable codebase.

### Decision: Phase 8 Stage 3 — Super-admin user management UI (2026-05-21)

- Context:
  - Stage 1 (2026-05-21) shipped the hierarchical `role` enum +
    `requireRole(min)` middleware + every `POST/GET/PATCH /users`
    endpoint, but with `requireRole('admin')` as a placeholder
    guard while no UI existed. Phase 8 capability matrix calls for
    `super_admin` exclusivity on user management.
  - Operator brief (2026-05-21) selected Stage 3 over Stage 2 (TOTP
    2FA) — the team is small enough that 2FA can wait, but the
    super_admin needs a browser UI for routine onboarding without
    SSH'ing to the container to run `create-user.ts`.
- Decision (backend tightening):
  - `/api/v1/users/*` guard switched from `requireRole('admin')`
    to `requireRole('super_admin')`. Regular admins now get 403,
    matching the capability matrix.
  - `users.service.patchUser` gained THREE lock-out guards, each
    returning `422 UNPROCESSABLE` with a stable FE-readable code:
      1. `USER_CANNOT_SELF_BLOCK` — actor sets own `isActive=false`.
         No higher tier exists who could undo it.
      2. `USER_CANNOT_SELF_DOWNGRADE` — actor changes own role.
         Next request would 403 out of `/admin/users`.
      3. `LAST_SUPER_ADMIN` — patch would demote or block the last
         active super_admin. We require at least one OTHER active
         super_admin to remain so the admin surface stays reachable.
  - `countActiveUsersByRoleExcluding(role, excludeId)` repo helper
    backs guard 3. Counts active users matching `role` excluding a
    specific id — used to ask "would zero OTHER super_admins remain
    after this patch?".
- Decision (frontend):
  - New `src/api/users.ts` mirrors backend schemas: `listUsers`,
    `getUser`, `createUser`, `patchUser`, `resetUserPassword`.
  - New `src/components/RequireRole.tsx` layout-route guard renders
    a 403 page (NOT a redirect — the user IS authenticated, just
    insufficient role) inside the AppShell. Composes inside
    PrivateRoute.
  - New `src/pages/AdminUsersPage.tsx` at `/admin/users`:
      - Table with email + login + display name + role badge + status
        badge + per-row Edit / Reset password buttons.
      - "You" badge on the actor's own row so the operator never
        accidentally clicks Edit on themselves expecting it to be a
        different account.
      - Three modals (Create, Edit, Reset password). Each is a thin
        form over the corresponding api wrapper.
      - Lock-out 422 codes surface inline in the Edit modal without
        closing it — operator keeps form state and can correct.
  - Navigation: `AppHeader` filters tabs by `minRole` and only
    renders the "Users" tab when `hasRole('super_admin')`. Non-
    super_admin operators never see the entry; even if they
    manually type `/admin/users` the RequireRole guard catches it.
- Decision (deferred from the original spec):
  - Invite copy-link flow + `user_invites` table — replaced by
    super_admin-sets-initial-password-and-forwards-manually. The
    invite-link flow adds a `user_invites` table + `/accept-invite`
    page + token expiry handling, which doubles the surface for
    very little operator UX gain at our team size. Re-open if the
    headcount grows and onboarding becomes routine.
  - "Sign out everywhere" (per `/me` cabinet design) — waits for
    Stage 2 (`/me` doesn't exist yet).
  - Force-disable 2FA — N/A until Stage 2 introduces 2FA at all.
- Trade-off:
  - Plaintext password is rendered in the Create + Reset modals so
    the super_admin can copy it. We treat that as acceptable — the
    super_admin is the only viewer, the modal closes after action,
    and there's no DOM mutation tracking the value beyond the
    React state that React already manages.
  - LAST_SUPER_ADMIN guard runs ONLY when the target is currently
    super_admin AND the patch would demote/block. This skips a
    redundant query on common non-super_admin edits.
- Consequence:
  - The bootstrap-super-admin CLI flow (Stage 1) remains the FIRST
    super_admin path; the UI flow handles subsequent operators.
  - Stage 4 (document event log) and Stage 5 (admin documents tab)
    can now reliably read the actor's `displayName` for event rows
    because the user-management UI keeps `users.display_name` fresh.

- Verification:
  - 290 frontend tests pass (was 281; +9 from new AdminUsersPage suite).
  - 275 server tests pass (was 271; +4 from new super_admin guard
    tests in `users.integration.test.ts`).
  - TypeScript clean (frontend + server).

### Decision: Phase 8 Stage 4 — per-entity event log (2026-05-21)

- Context:
  - End-of-operations brief asked for a per-document "History" panel
    so the team can see who created / synced / downloaded each
    artifact. Per follow-up, the same trail should also live on
    `/calc/:id` for calculator-configs (operator: "додай events
    для calc-configs теж").
  - Stage 5 will need a similar trail for soft-delete /restore;
    Stage 4 lays the table + write hooks first so Stage 5 just
    widens the event_type enum.
- Decision (schema):
  - TWO parallel tables (`document_events`, `calculator_config_events`)
    instead of a single polymorphic `audit_events`. Postgres doesn't
    support polymorphic FKs and a shared CHECK enum would conflate
    document-only events (`pdf_downloaded`) with calc-only ones.
    Each table has its own event_type vocabulary.
  - `ON DELETE CASCADE` on the entity FK (interim — Stage 5 will
    introduce soft-delete via `deleted_at` UPDATE rather than DELETE,
    keeping events alongside the soft-deleted row). The CASCADE
    keeps the events tree consistent with the entity tree today.
  - `actor_user_id` FK → users with `ON DELETE SET NULL` — deleting
    a user keeps their events but reads as "system" rather than
    leaving a dangling pointer.
  - `meta jsonb DEFAULT '{}'` — context-specific (noteId for
    synced_to_hubspot, error for sync_failed, download flag for
    pdf_downloaded). Schema doesn't validate; FE reads optimistically.
- Decision (write paths):
  - **`createDocument`** writes `created` in the SAME TX as the
    documents INSERT so rollback wipes both together.
  - **`syncDocumentToHubspot`** writes `synced_to_hubspot` on
    success and `sync_failed` (with `{stage, error, ...}` meta) on
    each of the 3 failure paths. Each event-log INSERT is wrapped
    in try/catch — a failure here logs WARN but doesn't swap in for
    the operator-visible HubSpot error.
  - **`downloadPdfController`** writes `pdf_downloaded` AFTER
    `res.end(buffer)` so a slow event INSERT doesn't delay the PDF
    response. Best-effort; 5-min browser cache means same operator
    repeated clicks within the cache window don't re-hit.
  - **`createCalculatorConfig`** wraps insert + event in `db.transaction`.
  - **`syncCalculatorConfigToHubspot`** writes events on the same
    success + 3 failure paths as the document sync.
  - Each sync entrypoint gained an `actorUserId` arg: manual sync
    from controller passes `req.user.id`; auto-sync from
    `setImmediate` passes `null` (event reads as "system").
- Decision (frontend):
  - One generic `EventHistoryPanel` component on both detail pages.
    Backend speaks the same `PublicEvent` DTO; the panel is
    entity-agnostic.
  - Collapsed by default — operators iterating the calc don't see
    the history every load. Click header to expand.
  - Row format: `<event badge>` · `<actor>` · `<X ago>` with an
    optional inline meta line.
  - Event-type colour mapping (green = success, red = failure,
    slate = neutral) makes the timeline glanceable.
- Decision (deferred):
  - No event log yet for `companies` / `deals` / `users` —
    out-of-scope per the original spec; trivial to add later by
    spinning up a third `<entity>_events` table.
  - Auto-save events for calc-configs DELIBERATELY NOT recorded —
    every 2-second tick would drown the History panel in noise.
- Trade-off:
  - The pdf_downloaded event-log INSERT runs AFTER `res.end()`
    which means in a server-crash window (process exits before the
    INSERT completes) we lose the record. We accept it — losing the
    audit row of a download that already happened is strictly
    better than blocking the PDF response on the audit write.
  - Best-effort sync_failed event writes (wrapped in try/catch) can
    miss a row if the DB itself is down. The outer HubSpot error
    still propagates to the operator with the failed badge; the
    History panel just won't show a row for that particular
    failure. Acceptable.
- Consequence:
  - Stage 5 (soft-delete + HubSpot Note tear-down) widens the
    event_type CHECK enum with `deleted` / `restored` /
    `deletion_reason_edited` — no further schema migration needed.
  - Stage 6 (admin_actions cross-cutting audit log for super_admin
    operations like role changes) gets its own table; it does NOT
    repurpose document_events / calc_config_events because the
    SHAPE of an admin action differs (target_user_id vs.
    entity-FK).
- Verification:
  - 304 frontend tests pass (was 290; +14 from new EventHistoryPanel
    suite).
  - 282 server tests pass (was 275; +7 from new events integration
    suite covering created events + auth + 404 + CASCADE delete).
  - TypeScript clean (frontend + server).

### Decision: Phase 8 Stage 5 — Document soft-delete + HubSpot tear-down (2026-05-21)

- Context:
  - BSG-XXXXX numbers are reserved forever (HubSpot audit trail
    references them; ops doesn't want gaps). Hard-delete in our
    DB would silently lose context + create reservable gaps in
    the BSG number sequence reading.
  - Operators occasionally need to retract a document (client
    request, wrong company, replacement issued). HubSpot side
    must be cleaned up too — leaving a stale "Offer BSG-..." Note
    on the customer's timeline after we deleted it locally is bad
    audit hygiene.
- Decision (semantics):
  - **Soft-delete** in our DB via `deleted_at` + `deleted_by_user_id`
    + `deletion_reason` (5-value enum) + `deletion_note` (max 8KB).
  - **Hard-delete** the linked HubSpot Note via `hubspot.deleteNote`.
  - **Transactional honesty**: if the HubSpot DELETE fails we DO
    NOT soft-delete locally — instead set `state='delete_failed'`
    and surface a retry CTA on the detail page.
  - **Restore** clears the soft-delete fields. super_admin only.
    HubSpot side is NOT re-created — operator manually re-syncs
    via the existing Sync button if needed.
- Decision (schema):
  - Migration 0010 adds the four soft-delete columns to `documents`.
  - Soft-delete consistency CHECK: `deleted_at` + `deleted_by`
    must both be NULL (alive) or both NON-NULL (deleted).
  - Reason CHECK: enum of 5 values; 'other' makes note semantically
    required (FE form enforces; DB doesn't, so a future bulk-fix
    SQL still works).
  - `hubspot_sync_state` CHECK widened with `delete_pending` +
    `delete_failed` (two transition states).
  - `document_events.event_type` widened with `deleted`, `restored`,
    `deletion_reason_edited`.
  - Partial index `documents_alive_created_idx` so the "alive
    docs only" listing (the hot path) stays cheap as deleted rows
    accumulate over time.
- Decision (auth):
  - DELETE `/documents/:number` — `requireRole('admin')`. Regular
    users can't retract artefacts. Admin OR super_admin can.
  - POST `/documents/:number/restore` — `requireRole('super_admin')`.
    The restore decision is the single chokepoint that crosses
    the soft-delete boundary; we want a SHORT list of operators
    who can do it.
  - `?includeDeleted={true,only}` on the listing — silently coerced
    to 'alive' for non-super_admin (debugging flag, not a permission
    scope; we don't want 403 to leak the existence of the feature).
- Decision (frontend):
  - **`<DeleteDocumentModal />`** — reason dropdown + note textarea.
    'Other' makes the note required (client-side guard + server
    Zod refine). Warning copy adapts based on whether the doc has
    a HubSpot Note.
  - **DocumentViewPage** gets the Delete button (admin) / Restore
    button (super_admin) swap based on `doc.deletedAt`. Soft-deleted
    docs show a red banner with reason + note + timestamp; Sync
    button is hidden (server would 404 anyway).
  - **`/admin/documents/deleted`** new super_admin-only page listing
    soft-deleted rows. Per-row "Open →" link to the detail page
    (where the Restore button lives — single chokepoint for that
    action keeps the audit trail unified).
  - **AppHeader** filters tabs by minRole; adds "Deleted docs"
    only for super_admin.
- Decision (deferred):
  - Editing `deletion_reason` post-delete (the
    `deletion_reason_edited` event_type is added to the enum so
    Stage 6 can add this without another migration; the endpoint
    itself isn't wired in Stage 5).
  - Bulk-delete UI — operators rarely retract more than one doc
    at a time; per-row delete from the detail page is sufficient.
- Trade-off:
  - CASCADE on `document_events.document_id` — events disappear
    when the row is hard-deleted. Today only super_admin's DELETE
    FROM SQL can trigger that; soft-delete keeps events alive
    next to the row. We accept the trade-off: a future
    "purge truly old rows" operator action will explicitly delete
    the audit trail too.
  - The `hubspot_sync_state` enum now carries 5 values; the FE
    has to know about `delete_pending` + `delete_failed`. The
    DocumentViewPage's Sync button label adapts to 'Retry delete'
    when state is delete_failed so the operator can recover.
- Consequence:
  - Stage 6 (admin_actions cross-cutting audit log) can drop the
    restore action into its log without further schema work
    (event_type 'restored' is already in `document_events`; the
    cross-entity log lives in a separate table for super_admin
    operations on users + bulk doc deletes).
  - The deletion_reason metadata flows through the History panel
    on /documents/:number, the deleted-docs page, and any future
    Stage 4+ reporting.
- Verification:
  - 313 frontend tests pass (was 304; +9 from new DeleteDocumentModal
    suite).
  - 296 server tests pass (was 282; +14 from new documents-delete
    integration suite covering auth + 4 happy paths + HubSpot
    tear-down + restore + listing filter). One pre-existing flake
    in companies-deals pagination test (unrelated to Stage 5;
    passes in isolation, fails ~1/3 of full-suite runs under
    parallel TX load).
  - TypeScript clean (frontend + server).

### Decision: Sprint 9.M — Stages 3/4/5 audit closure (2026-05-21)

- Context:
  - Post-Stage-5 four-agent parallel audit (database-reviewer,
    typescript-reviewer, security-reviewer, code-reviewer) surfaced
    30+ findings across the recent stages. None CRITICAL, but two
    HIGH-severity correctness bugs (restore-state + advisory-lock-
    TX-boundary) plus two MEDIUM security gaps (single-doc
    deleted-visibility + event-meta note leak) needed attention
    before considering the stages "hand-off ready".
- Decision (bug fixes — applied):
  - **B1** `restoreDocument` now resets `hubspot_sync_state` to
    `'not_synced'` + clears `hubspotNoteId`. Previously a row
    restored from a `delete_failed` state retained the failed
    badge with `noteId = null` — incoherent (nothing to retry).
  - **B3** Removed a nested try/catch in `deleteDocument` that
    silently swallowed a DB-level failure during the
    `delete_pending` → `delete_failed` recovery write. The state
    UPDATE now propagates as a 5xx, surfacing the DB blip to ops.
  - **B4** Dynamic `import("./sync.service")` calls in both
    `documents.service` and `calculator-configs.service` now have
    `.catch(importErr)` that logs ERROR on module-resolution
    failure (was silently swallowed by the outer `void`).
  - **B5** `getDocumentByNumber` + `listDocumentEventsByNumber`
    now accept the caller's role and return 404 on soft-deleted
    documents for non-super_admin. Before, regular operators
    could read `deletionReason` + `deletionNote` + `deletedByUserId`
    via the single-doc fetch (the listing already hid them).
  - **B6** Removed the raw `note` content from the `deleted` event
    meta. The History panel now sees only `{reason, hasNote,
    hubspotNoteIdRemoved}`. The source of truth for the note body
    is `documents.deletion_note`, which is gated to super_admin
    via the B5 fix.
  - **B7** Added a Postgres advisory transaction lock to
    `deleteDocument`. Two concurrent DELETE clicks for the same
    document used to both pass the `if (doc.deletedAt)` check
    before either had finished writing back state; both would
    then issue `hubspot.deleteNote()` and the second hit a 404 in
    HubSpot that surfaced as a misleading `delete_failed`. Now
    the second caller gets `409 DOCUMENT_DELETE_IN_PROGRESS`.
- Decision (schema improvements):
  - **S1** Migration 0011 adds composite partial index
    `documents (company_id, created_at DESC) WHERE deleted_at IS NULL`
    — the actual hot-path index for the per-company alive listing.
    The Stage 5 single-column variant was a planner mis-fit.
  - **S2** Capped the event listing repository functions at
    `LIMIT 200` to avoid unbounded payloads from heavily-used docs.
  - **S3** Updated the stale "ON DELETE RESTRICT" header comment
    in `schema/events.ts` to match the actual CASCADE behaviour.
  - **S4** Drizzle `.$type<>()` annotations on `scope`,
    `hubspot_sync_state`, `deletion_reason` columns replace the
    unsound `as DocumentPublic["..."]` casts in `toPublic`.
- Decision (DRY refactors):
  - **D1** Extracted `tryRecordEvent(insertFn, options)` to
    `server/modules/events/events.helpers.ts`. Replaces 10+ copy-
    paste try/catch + `logger.warn` blocks across `documents.service`,
    `documents.sync.service`, `calculator-configs.sync.service`,
    and `pdf.controller`. ~80 lines net removed.
- Decision (test coverage gaps):
  - **T1** New `AdminDeletedDocumentsPage.test.tsx` (6 tests) —
    the only previously untested Stage 3-5 page.
  - **T3** Three new integration tests in `documents-delete`:
    deleted-doc + Sync → 404, deleted-doc + Use-as-template → 404,
    deleted-doc + events read by non-super_admin → 404,
    deleted-doc + single-fetch by non-super_admin → 404.
- Decision (polish):
  - **N1** Removed dead switch/case in AdminUsersPage Edit modal
    onError (every branch did `setError(err.message)`).
  - **N3** Deleted unused export `countActiveUsersByRole`.
  - **N5** Relocated `humanReason` helper below imports block
    in `DocumentViewPage.tsx` (was sandwiched between import
    statements — compiled fine, read confusingly).
  - **N6** `throw new Error(...)` in deleteDocument/restoreDocument
    replaced with `InternalError` (structured 500).
  - **N7** Updated `phase_8_security_admin_audit.md` edge-case
    spec to reconcile with the as-shipped implementation. Updated
    `documents.integration.test.ts` file-level docstring.
- Decision (intentionally deferred):
  - `getRawDocumentByNumber` + PDF download endpoint stays
    accessible for soft-deleted docs to any authenticated user
    (audit access). Documented with a comment + integration tests
    that pin this policy.
  - `documents.service.ts` split (now ~620 LOC) deferred to
    Stage 6 when `deletion_reason_edited` ships.
  - Last-super_admin guard 3 logically unreachable via non-self
    target — documented in `users.service.ts` as a known limitation
    rather than refactored (the practical case is covered by
    self-downgrade guard 2).
  - bcrypt floor of 4 in `BCRYPT_COST` for non-prod environments
    — accepted (tests run faster; prod hardening enforced by the
    `superRefine` block in env config).
- Verification:
  - 319 frontend tests pass (was 313; +6 from AdminDeletedDocumentsPage
    suite).
  - 299 server tests pass (was 296; +3 from new guard tests in
    documents-delete: soft-deleted Sync/use-as-template/single-doc).
  - TypeScript clean (frontend + server).
