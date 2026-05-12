# Backend State Schemas — Phase 8 handoff

Single source of truth for the shape of data the frontend sends to
(and receives from) the Phase 8 backend. Anything not listed here is
either (a) UI-only and never persisted, or (b) computed server-side.

Two complementary contracts live in the codebase already as typed TS
modules — backend Zod schemas mirror these one-for-one.

| Contract | TS source | DB table / column |
|---|---|---|
| Snapshot payload | `src/components/calculator/snapshotShape.ts` → `CalculatorSnapshotPayload` | `calculator_snapshots.payload` (JSONB) |
| Derived summary | `src/components/calculator/derivedSummaryShape.ts` → `DerivedSummaryPayload` | `calculator_snapshots.derived_summary` (JSONB) |
| Document payload | `src/components/document-wizard/types.ts` → `DocumentTemplatePayload` | `documents.payload` (JSONB) |

The frontend already exports `extractCalculatorSnapshot(state)` and
`seedCalculatorStateFromSnapshot(snapshot)` for the round-trip on the
snapshot contract. The other two contracts are pure type declarations
today; the helpers will be wired up when the matching endpoints exist.

---

## 1. CalculatorSnapshotPayload

The persisted INPUT — what an operator captured at a point in time.
Everything that drives the math is here; UI toggles are not.

### Top-level shape

```ts
interface CalculatorSnapshotPayload {
  schemaVersion: 1;                    // bumps on breaking changes
  calculatorType: CalculatorTypeSelection;  // { payin, payout }

  // Zone 1 — traffic
  payinVolume: number;                 // monthly EUR
  payinTransactions: number;
  approvalRatioPercent: number;        // 0..100
  euPercent: number;                   // 0..100, ww is 100 - euPercent
  ccPercent: number;                   // 0..100, apm is 100 - ccPercent
  payoutVolume: number;
  payoutTransactions: number;

  // Zone 2 — introducer commission
  introducerEnabled: boolean;
  introducerCommissionType: "standard" | "custom" | "revShare";
  customTier1UpToMillion: number;
  customTier2UpToMillion: number;
  customTier1RatePerMillion: number;
  customTier2RatePerMillion: number;
  customTier3RatePerMillion: number;
  revSharePercent: number;             // clamped 0..50

  // Zone 3 — pricing
  settlementIncluded: boolean;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;

  // Zone 4 — other fees + limits
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  failedTrxMode: "overLimitOnly" | "allFailedVolume";  // see note A
  failedTrxOverLimitThresholdPercent: number;

  // Contract summary (Zone 4 → Zone 6)
  contractSummarySettings: ContractSummarySettings;   // see below

  // Free-form notes (drive offer copy)
  clientNotes: string;
}
```

### Nested: `PayinRegionPricingConfig`

```ts
interface PayinRegionPricingConfig {
  model: "icpp" | "blended";
  trxFeeEnabled: boolean;
  rateMode: "single" | "tiered";
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  single: { mdrPercent: number; trxCc: number; trxApm: number };
  tiers: [PayinRateSet, PayinRateSet, PayinRateSet];
  schemeFeesPercent: number;
  interchangePercent: number;
  // EU-only feature (UK + Switzerland scheme-fee split). The EU
  // pricing config carries it; the WW config never sets it. See
  // `decisions.md` 2026-05-12 entries for full rationale.
  dedicatedCountries?: {
    enabled: boolean;
    ukPercent: number;       // 0..100
    chPercent: number;       // 0..100
    // NOTE: no `coefficientPercent` — locked to a code constant
    // (DEFAULT_DEDICATED_COUNTRIES_COEFFICIENT_PERCENT = 1.30%).
  };
}
```

### Nested: `PayoutPricingConfig`

```ts
interface PayoutPricingConfig {
  rateMode: "single" | "tiered";
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  single: { mdrPercent: number; trxFee: number };
  tiers: [PayoutRateSet, PayoutRateSet, PayoutRateSet];
}
```

### Nested: `ContractSummarySettings`

```ts
interface ContractSummarySettings {
  accountSetupFee: number;
  refundCost: number;
  disputeCost: number;
  settlementPeriod: "T+1" | "T+2" | "T+3" | "T+4" | "T+5";  // default T+3
  collectionLimitMin: number;
  collectionLimitMax: number;
  payoutLimitMin: number;
  payoutLimitMax: number;
  rollingReservePercent: number;
  rollingReserveHoldDays: number;
  rollingReserveCap: number;
  payoutMinimumFeeMode: "overall" | "byRegion";
  payoutMinimumFeeThresholdMillion: number;
  payoutMinimumFeePerTransaction: number;
  payoutMinimumFeeEuThresholdMillion: number;
  payoutMinimumFeeEuPerTransaction: number;
  payoutMinimumFeeWwThresholdMillion: number;
  payoutMinimumFeeWwPerTransaction: number;
}
```

### NOT in the payload (intentional)

These are UI-only and recreated on every session. If a future endpoint
needs to restore "session resumes where the user left off", introduce
a separate `wizard_session` row — do NOT pack into the snapshot.

- `showHardcodedConstants`
- `showZone3Formulas`
- `showZone4Formulas`
- `showUnifiedFormulas`
- `unifiedExpandedById`
- `zoneExpanded`
- `offerSummaryActionMessage` (transient flash message)

### Note A — label vs data-key mismatch

The 2026-05-12 batch renamed the UI label "Over limit only" → "Under
limit only". The DATA key `failedTrxMode: "overLimitOnly"` is
unchanged; the calculation still treats the threshold as the upper
cap. If product later asks to flip the calculation too, plan a
schema-version bump (rename to `"underLimitOnly"`, invert the
comparison in the math layer, write a backfill migration).

---

## 2. DerivedSummaryPayload

What backend persists alongside the snapshot so listing / dashboard /
HubSpot writes don't need to re-execute the full math layer.

### Top-level shape

```ts
interface DerivedSummaryPayload {
  schemaVersion: 1;
  payin: PayinProfitabilityResult;     // EU/WW revenue+cost+netMargin
  payout: PayoutProfitabilityResult;
  other: OtherRevenueProfitabilityResult;
  total: TotalProfitabilityResult;     // bottom-line + mode + warning
  // SQL-friendly scalars duplicated from `total` for cheap ordering
  ourMarginEuro: number;
  totalRevenueEuro: number;
  totalCostsEuro: number;
}
```

`PayinProfitabilityResult`, `PayoutProfitabilityResult`,
`OtherRevenueProfitabilityResult`, `TotalProfitabilityResult` are
exported from `src/domain/calculator/zone5/types.ts` — mirror them
verbatim in Zod.

### Computation rule

The frontend's `useCalculatorDerivedData` hook currently produces every
field above (as separate memoised values). Wiring up a single
`extractDerivedSummary(snapshot): DerivedSummaryPayload` function is
a Phase-8 task once the `POST /calculator-snapshots` endpoint exists.
The function must be PURE (callable from Node) so PDF re-render and
HubSpot sync can recompute on-demand from the snapshot input.

See `docs/backend_computation_boundary.md` for "recompute on read" vs.
"trust stored summary" decisions.

---

## 3. DocumentTemplatePayload

What lands in `documents.payload` (JSONB). The wizard's `WizardPage`
already maintains this as React state today; backend persists the
full blob on `POST /documents`.

Full TS type lives at:
`src/components/document-wizard/types.ts:DocumentTemplatePayload`.

### Business-fact fields (drive billing / HubSpot / contract text)

All `header.*`, `agreementParties.*`, `calculatorType`, `payin.*`
share splits, **every** `contractSummary.*` except the custom-note
text fields, `payinPricing.{eu,ww}.{model,rateMode,trxFeeEnabled,
tier*UpToMillion,single.{mdrPercent,trxCc,trxApm},tiers[*].{mdrPercent,
trxCc,trxApm}}`, `payoutPricing` analogous, all `toggles.*`.

### Display-only fields (still persisted, do NOT push to HubSpot)

- `layout.*` — recomputable from `payinPricing.*.rateMode` + region
  percentages via `resolvePayinTableMode()` in `wizard/layoutHelpers.ts`.
  Persist for convenience; backend can regenerate on read.
- `valueModes` — per-cell render hint (`value` / `waived` / `na` / `tbd`).
- `contractSummary.payoutMinimumFeeEuNa`,
  `contractSummary.payoutMinimumFeeWwNa`,
  `contractSummary.payinCustomNoteEnabled`,
  `contractSummary.payinCustomNoteText`,
  `contractSummary.payoutCustomNoteEnabled`,
  `contractSummary.payoutCustomNoteText`,
  `contractSummary.customTermsItems[*].color`.
- `payinPricing.*.single.trxCcNa`, `trxApmNa`,
  `payoutPricing.single.trxFeeNa` and tier-level equivalents.
- `toggles.payoutMinimumFeePerTransactionNa`.

### Calculator-only — NOT in DocumentTemplatePayload

`PayinRegionPricingConfig.dedicatedCountries` lives in the snapshot
contract but is intentionally DROPPED when reshaping into the
document payload. The feature affects internal scheme-fee math only
and never surfaces in the OFFER PDF. See 2026-05-12 decision entries
in `decisions.md`. Code path: `seedHelpers.clonePayinRegionPricing`
destructures the field out; `fromCalculator.ts` uses the helper.

### Open per `docs/ui_phase_8_9_requirements.md`

The future documents listing / view-mode / clone flow may add:
- `clients.id` as a side-channel param (NOT in the payload blob).
- `parent_document_id` / `parent_snapshot_id` for lineage.
- `hubspot_*` columns on `documents` (Phase 9, nullable from Phase 8).

---

## Versioning & migration policy

- `schemaVersion: 1` on both snapshot and derived-summary contracts.
- Bump rules:
  - Add an optional field → NO bump.
  - Remove or rename a field → BUMP + write a backfill migration that
    rewrites stored JSONB.
  - Change semantics of an existing field (e.g. flip
    `failedTrxMode` direction) → BUMP + migrate, even if the field
    name stays.
- Backend SHOULD reject `POST` payloads with unknown
  `schemaVersion` instead of silently parsing — version drift is too
  expensive to debug later.

---

## Code references

- `src/components/calculator/snapshotShape.ts` — contract + helpers.
- `src/components/calculator/derivedSummaryShape.ts` — derived contract.
- `src/components/document-wizard/types.ts` — document payload.
- `src/domain/calculator/zone5/types.ts` — profitability result types.
- `tsconfig.server.json` — proves these types compile without DOM.
- `docs/backend_computation_boundary.md` — recompute vs. trust rules.
- `docs/client_and_hubspot_workflow.md` — Phase 8/9 client/HubSpot.
- `docs/ui_phase_8_9_requirements.md` — new UI scope (listing, view,
  clone, HubSpot status).
- `docs/phase_08_backend_plan.md` — full backend plan (still current).
