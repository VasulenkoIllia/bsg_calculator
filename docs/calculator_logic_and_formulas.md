# Calculator Logic and Formulas (Current Code)

Date: 2026-04-28
Scope: current implementation in `src/App.tsx` and `src/domain/calculator/zone0..zone6`.

This document is the technical source of truth for runtime calculation behavior.

## 1. Runtime flow (high level)

1. Zone 0 selects active modes (`payin`, `payout`) with at least one always enabled.
2. Zone 1 normalizes traffic inputs and derives attempts/failed/splits.
3. Zone 2 computes introducer model outputs from payin base volume and Zone 5 payin totals (for rev share).
4. Zone 3 computes pricing previews (payin EU/WW + payout) with tier logic and payout minimum floors.
5. Zone 4 computes fee/limit impacts (payout minimum uplift, 3DS, settlement, monthly minimum, failed trx charging).
6. Zone 5 aggregates profitability (payin + payout + other revenue) and total margin.
7. Zone 6 builds text offer summary from current state and supports copy/print/PDF-save flow.

### 1.1 Startup presets and global actions

Initial/default state currently applies these defaults:

- Zone 0: `Payin = on`, `Payout = off`.
- Zone 1A:
  - Monthly Payin Volume: `€1,000,000`
  - Successful Payin Transactions: `10,000`
  - Approval Ratio: `80%`
  - EU / WW split: `80% / 20%`
  - CC / APM split: `90% / 10%`
- Zone 1B (stored in the default preset and shown when Payout is enabled):
  - Monthly Payout Volume: `€200,000`
  - Total Payout Transactions: `2,000`
- Zone 3:
  - `Settlement Included = off`
  - Payin EU pricing model: `Blended`
  - Payin WW pricing model: `IC++` (kept unchanged because the default request explicitly named EU)
  - Payin EU/WW `TRX Fee Enabled = on`
  - Payin EU/WW rate type: `Single Rate`
  - Payin EU/WW tier boundaries: `5M / 10M`
  - Scheme defaults used in calculation costs: EU `0.75%`, WW `2%`
  - Scheme Fees are not shown in Zone 3 UI; `Interchange (%)` remains visible in Zone 3.
  - Zone 6 Offer Summary still includes Scheme Fees for now by product decision.
  - Payout rate type: `Single Rate`
  - Payout tier boundaries: `1M / 5M`

Global top controls:

- `Apply defaults` reapplies the current default preset. More zone defaults can be added to this preset as they are defined.
- `Reset all to 0` applies the zero preset to editable numeric values and resets optional toggles/settings. Zone 0 remains normalized to `Payin = on`, `Payout = off` because the calculator type domain requires at least one active mode. Complement split fields still follow the current `100 - primary` rule.

## 2. Shared normalization rules

From `src/domain/calculator/shared/math.ts`:

- `VOLUME_ROUNDING_STEP = 50_000`
- `roundUpToStep(value, step)`:
  - non-finite or `<= 0` -> `0`
  - otherwise `ceil(value / step) * step`
- `normalizePercent(value)` clamps to `[0, 100]`
- `splitByPercent(total, p)` uses floating-point split
- `splitIntegerByPercent(total, p)` rounds primary integer part and keeps remainder in secondary
- `toInteger(value)` -> rounded non-negative integer

Formatting from `src/domain/calculator/shared/format.ts`:

- `formatAmountInteger` -> `€` + integer formatting.
- `formatAmount2` currently truncates decimals before rendering (integer display).

## 3. Zone 0 (Calculator Type)

From `zone0/calculatorType.ts`:

- If both modes become disabled, state is normalized to `{ payin: true, payout: false }`.
- If user disables the only active mode, the other mode is auto-enabled.

## 4. Zone 1 (Traffic Input)

From `zone1/traffic.ts`.

### 4.1 Payin normalization

Given input:
- `monthlyVolume`
- `successfulTransactions`
- `approvalRatioPercent`
- `euPercent`
- `ccPercent`

Normalize:
- `monthlyVolume = roundUpToStep(max(0, input.monthlyVolume), 50_000)`
- `successfulTransactions = toInteger(input.successfulTransactions)`
- `approvalRatioPercent = clamp(input.approvalRatioPercent, 0, 100)`
- `approvalRatio = approvalRatioPercent / 100`
- `wwPercent = 100 - euPercent`
- `apmPercent = 100 - ccPercent`

### 4.2 Payin derived formulas

- `averageTransaction = monthlyVolume / successfulTransactions` (if `successfulTransactions > 0`, else `0`)
- `totalAttempts = ceil(successfulTransactions / approvalRatio)` (if `approvalRatio > 0`, else `successfulTransactions`)
- `failedTotal = max(0, totalAttempts - successfulTransactions)`
- Volume splits:
  - `euVolume, wwVolume = splitByPercent(monthlyVolume, euPercent)`
  - `ccVolume, apmVolume = splitByPercent(monthlyVolume, ccPercent)`
- Region/method breakdown uses integer split helper and keeps totals consistent (`euCc`, `euApm`, `wwCc`, `wwApm`).

### 4.3 Payout normalization and derived

Given input:
- `monthlyVolume`
- `totalTransactions`

Normalize:
- `monthlyVolume = roundUpToStep(max(0, input.monthlyVolume), 50_000)`
- `totalTransactions = toInteger(input.totalTransactions)`

Derived:
- `averageTransaction = monthlyVolume / totalTransactions` (if `totalTransactions > 0`, else `0`)

## 5. Zone 2 (Introducer Commission)

From `zone2/introducerCommission.ts` and App wiring.

### 5.1 Base volume

- `introducerBaseVolume = payin.normalized.monthlyVolume` only when payin mode is enabled.
- If payin mode is off, base volume is `0`.

### 5.2 Standard (retrospective)

Default tiers:
- Tier 1: up to `10M`, `€2,500 / €1M`
- Tier 2: up to `25M`, `€5,000 / €1M`
- Tier 3: above `25M`, `€7,500 / €1M`

Formula:
- `volumeMillion = volumeEuro / 1_000_000`
- Resolve one tier by boundary.
- `totalCommission = volumeMillion * appliedTier.ratePerMillion`

### 5.3 Custom (progressive)

- Uses 3 tier slices and configurable boundaries/rates.
- Boundaries normalized so `tier2 >= tier1`.

For each tier:
- `volumeInTier = overlap(volumeMillion, tier.from..tier.to)`
- `commissionTier = volumeInTier * ratePerMillion`

Total:
- `totalCommission = sum(tier commissions)`

### 5.4 Rev Share

Input:
- `totalRevenue` and `totalCosts` are auto-fed from Zone 5 payin totals in App.
- `sharePercent` clamped to `[0, 50]`.

Formula:
- `marginBeforeSplit = totalRevenue - totalCosts`
- `partnerShare = marginBeforeSplit * sharePercent / 100`
- `ourMargin = marginBeforeSplit - partnerShare`

## 6. Zone 3 (Pricing Configuration)

From `zone3/pricingConfiguration.ts`.

### 6.1 Defaults and boundaries

- Default settlement flag is `false`, so Zone 4 settlement fee settings are visible by default.
- Payin EU defaults to `Blended`; Payin WW remains `IC++`.
- Payin EU/WW default to enabled TRX fees and `Single Rate`.
- Payin EU/WW tier boundaries default to `5M / 10M`.
- Payout defaults to `Single Rate`; payout tier boundaries default to `1M / 5M`.
- Tier boundaries normalized with cap at `25M` for preview splitter.
- Payout minimum floors (always applied in payout preview math):
  - `PAYOUT_MDR_MIN_PERCENT = 1.3`
  - `PAYOUT_TRX_MIN_FEE = 0.2`
- Warnings:
  - Payin low MDR `< 2.5%`, high MDR `> 10%`
  - Payout MDR below 1.3 or above 5
  - Payout TRX below 0.2 (minimum) and below 0.4 (low warning)

### 6.2 Payin preview

Input per region (EU/WW):
- volume, average transaction
- successful CC/APM counts
- method volumes CC/APM
- config (`model`, `rateMode`, rates, scheme/interchange)

Zone 3 UI shows `Interchange (%)` for Blended but does not show or edit `Scheme Fees (%)`.
Scheme values remain internal defaults and appear as costs in calculation sections. Zone 6 Offer Summary
still displays Scheme Fees for now; hiding Scheme there is a separate product decision.

Single rate:
- `mdrRevenue = volume * mdrPercent / 100`
- `trxRevenue = successfulCc * trxCc + successfulApm * trxApm` (only if `trxFeeEnabled`)

Tiered rate:
- Split region volume into tier1/tier2/tier3 progressive slices.
- Allocate tier CC/APM volumes by method share of total region volume.
- `tierTransactions = tierMethodVolume / averageTransaction` (if average > 0)
- `tierMdrRevenue = tierVolume * tierMdr%`
- `tierTrxRevenue = tierCcTx * tierTrxCc + tierApmTx * tierTrxApm` (if `trxFeeEnabled`)
- Region totals are sums of tier rows.

Scheme cost impact preview:
- `schemeCostImpact = volume * schemeFeesPercent / 100` only for `blended`.
- For `icpp`, `schemeCostImpact = 0`.
- Current Scheme defaults: EU `0.75%`, WW `2%`.

Output:
- `totalRevenue = mdrRevenue + trxRevenue`
- `revenueAfterSchemePreview = totalRevenue - schemeCostImpact`

### 6.3 Payout preview

Single rate:
- Apply minima to configured rate set:
  - `appliedMdr = max(1.3, configuredMdr)`
  - `appliedTrx = max(0.2, configuredTrx)`
- `mdrRevenue = volume * appliedMdr / 100`
- `trxRevenue = totalTransactions * appliedTrx`

Tiered rate:
- Split volume progressively by tier boundaries.
- Per tier apply minima to that tier's configured MDR/TRX.
- `tierTransactions = tierVolume / averageTransaction` (if average > 0)
- `tierMdrRevenue = tierVolume * appliedTierMdr / 100`
- `tierTrxRevenue = tierTransactions * appliedTierTrx`
- Totals are sums of tier rows.

## 7. Zone 4 (Other Fees and Limits)

From `zone4/otherFeesAndLimits.ts` and App wiring.

### 7.1 Payout minimum fee impact

- User minimum fee normalized upward to one decimal:
  - `normalizePayoutMinimumFeePerTransaction(x) = ceil(x * 10) / 10`

Given base payout revenue and payout transactions:
- `perTransactionRevenue = payoutRevenue / payoutTransactions` (if tx > 0)
- If enabled and `perTransactionRevenue < minimumFee`, then minimum is applied.
- `appliedPerTransactionRevenue = minimumFee or perTransactionRevenue`
- `adjustedRevenue = appliedPerTransactionRevenue * payoutTransactions`
- `upliftRevenue = max(0, adjustedRevenue - payoutRevenue)`

### 7.2 3DS impact

- Revenue:
  - if enabled: `successfulTransactions * revenuePerSuccessfulTransaction`
  - else `0`
- Cost:
  - always `totalAttempts * providerCostPerAttempt`
- Net:
  - `revenue - cost`

Current defaults:
- revenue per successful tx: `€0.05`
- provider cost per attempt: `€0.03`

### 7.3 Settlement fee impact

Visibility:
- Settlement fee block is visible only when `settlementIncludedInPricing === false`.

Math:
- `baseNet = payinVolume + payoutVolume - payinFeesAll - payoutFeesAll`
- `chargeableNet = max(0, baseNet)`
- `ratePercent` clamped to `[0, 2]`
- `fee = chargeableNet * ratePercent / 100` only if visible and enabled; otherwise `0`
- `clientNet = baseNet - fee`

Important App wiring:
- `payinFeesAll = payinBaseRevenue + threeDsRevenue`
- `payoutFeesAll = payoutBaseRevenue`

### 7.4 Monthly minimum fee impact

- If enabled and `actualRevenue < minimumMonthlyRevenue`:
  - `appliedRevenue = minimumMonthlyRevenue`
  - `upliftRevenue = appliedRevenue - actualRevenue`
- Else uplift is `0`.

### 7.5 Failed TRX charging impact

Given failed CC/APM tx counts and effective CC/APM failed fees:
- `allFailedRevenue = failedCc * trxCcFee + failedApm * trxApmFee`
- `thresholdPercent` clamped to `[50, 95]`
- `thresholdAttempts = successfulTransactions / (thresholdPercent / 100)`
- `effectiveRevenue = allFailedRevenue` only when enabled and mode is `allFailedVolume`; otherwise `0`

Additional values currently computed in code:
- `overLimitAttempts = max(0, thresholdAttempts - totalAttempts)`
- `belowLimitAttempts = max(0, totalAttempts - thresholdAttempts)`

## 8. Zone 5 (Profitability)

From `zone5/profitability.ts` and App wiring.

### 8.1 Provider default costs

Payin provider MDR tiers (progressive):
- 0-10M: 1.7%
- 10-25M: 1.5%
- >25M: 1.4%

Payout provider MDR tiers (progressive):
- all tiers: 1.0%

Payout provider TRX tiers:
- all tiers: €0.40

Payin provider TRX cost per attempt:
- CC: €0.22
- APM: €0.27

### 8.2 Payin region profitability

Per region (EU/WW):
- Revenue:
  - `revenue.mdr = mdrRevenue`
  - `revenue.trx = trxRevenue`
  - `revenue.failedTrx = failedTrxRevenue`
  - `revenue.total = mdr + trx + failedTrx`
- Costs:
  - `providerMdr = progressive tier cost on volume`
  - `providerTrx = attemptsCc * ccCost + attemptsApm * apmCost`
  - `schemeFees = volume * schemeFees%` only for `blended`, else `0`
  - `interchange = volume * interchange%` only for `blended`, else `0`
  - `costs.total = providerMdr + providerTrx + schemeFees + interchange`
- Net:
  - `netMargin = revenue.total - costs.total`

Payin aggregate:
- Sum EU and WW revenue/cost fields.
- `payin.netMargin = payin.revenue.total - payin.costs.total`

### 8.3 Payout profitability

- Revenue:
  - `revenue.total = mdrRevenue + trxRevenue`
- Costs:
  - provider MDR progressive by payout volume
  - provider TRX by progressive transaction allocation (`tierTransactions * 0.4`)
- Net:
  - `netMargin = revenue.total - costs.total`

### 8.4 Other revenue profitability

- `revenue.total = threeDsRevenue + settlementFeeRevenue + monthlyMinimumAdjustment`
- `costs.total = threeDsCost`
- `other.netMargin = revenue.total - costs.total`

### 8.5 Total profitability

- `totalRevenue = payin.revenue.total + payout.revenue.total + other.revenue.total`
- `totalCosts = payin.costs.total + payout.costs.total + other.costs.total`
- `marginBeforeIntroducer = payin.netMargin + payout.netMargin + other.netMargin`

If introducer mode is `revShare`:
- `revSharePercentApplied = clamp(revSharePercent, 0, 50)`
- `introducerCommission = payinNetMargin * revSharePercentApplied / 100` (payin only)

If introducer mode is `standard` or `custom`:
- `introducerCommission = introducerCommissionAmount`

Final:
- `ourMargin = marginBeforeIntroducer - introducerCommission`
- Warning displayed when `ourMargin < 0`.

## 9. Zone 6 (Offer Summary)

From `zone6/offerSummary.ts` and App wiring.

- Text summary is rebuilt on every input/state change.
- Includes only active calculator blocks and enabled fee options.
- Contains sections:
  1. Client parameters
  2. Pricing
  3. Additional fees
  4. Transaction limits
  5. Contract summary
  6. Introducer commission

Export actions in App:
- Copy via Clipboard API.
- Print/PDF via popup + browser print dialog (`Save as PDF`).

## 10. Current mode behavior and coupling notes

- The project is currently frontend-first (single-page app).
- Domain formulas are in `src/domain/calculator/*` and used by `src/App.tsx`.
- Existing `server/` folder has only a lightweight health endpoint and is not used by the frontend runtime path.
- For rev share, commission base is payin profitability only.
- For IC++, scheme/interchange costs are excluded from payin cost totals.
