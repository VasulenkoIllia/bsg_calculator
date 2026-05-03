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
