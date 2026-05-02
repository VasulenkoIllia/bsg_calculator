import {
  DEFAULT_PROVIDER_PAYIN_MDR_TIERS,
  DEFAULT_PROVIDER_PAYIN_TRX_APM_COST,
  DEFAULT_PROVIDER_PAYIN_TRX_CC_COST
} from "./constants.js";
import {
  calculateProviderMdrRows,
  distributeProviderMdrRowsByShare,
  normalizePercent,
  safeNonNegative,
  sumCosts
} from "./internals.js";
import type {
  PayinProfitabilityInput,
  PayinProfitabilityResult,
  PayinRegionProfitability,
  PayinRegionProfitabilityInput
} from "./types.js";

export function calculatePayinRegionProfitability(
  input: PayinRegionProfitabilityInput
): PayinRegionProfitability {
  const volume = safeNonNegative(input.volume);
  const mdrRevenue = safeNonNegative(input.mdrRevenue);
  const trxRevenue = safeNonNegative(input.trxRevenue);
  const failedTrxRevenue = safeNonNegative(input.failedTrxRevenue);
  const attemptsCc = safeNonNegative(input.attemptsCcTransactions);
  const attemptsApm = safeNonNegative(input.attemptsApmTransactions);

  const providerMdrRows = calculateProviderMdrRows(volume, DEFAULT_PROVIDER_PAYIN_MDR_TIERS);
  const providerMdr = sumCosts(providerMdrRows);

  const providerTrxCcCost = safeNonNegative(
    input.providerTrxCcCost ?? DEFAULT_PROVIDER_PAYIN_TRX_CC_COST
  );
  const providerTrxApmCost = safeNonNegative(
    input.providerTrxApmCost ?? DEFAULT_PROVIDER_PAYIN_TRX_APM_COST
  );
  const providerTrxCcTotal = attemptsCc * providerTrxCcCost;
  const providerTrxApmTotal = attemptsApm * providerTrxApmCost;
  const providerTrx = providerTrxCcTotal + providerTrxApmTotal;

  // Scheme fees are applied only for Blended.
  const schemeFees =
    input.pricingModel === "blended"
      ? volume * (normalizePercent(input.schemeFeesPercent) / 100)
      : 0;
  // Product correction (2026-04-29): interchange is not a payin cost component.
  // Keep the field for compatibility in API shape, but exclude it from calculations.
  const interchange = 0;

  const revenueTotal = mdrRevenue + trxRevenue + failedTrxRevenue;
  const costsTotal = providerMdr + providerTrx + schemeFees;

  return {
    revenue: {
      mdr: mdrRevenue,
      trx: trxRevenue,
      failedTrx: failedTrxRevenue,
      total: revenueTotal
    },
    costs: {
      providerMdr,
      providerTrx,
      schemeFees,
      interchange,
      total: costsTotal
    },
    providerMdrRows,
    providerTrxBreakdown: {
      attemptsCc,
      attemptsApm,
      ccCost: providerTrxCcTotal,
      apmCost: providerTrxApmTotal,
      total: providerTrx
    },
    netMargin: revenueTotal - costsTotal
  };
}

export function calculatePayinProfitability(
  input: PayinProfitabilityInput
): PayinProfitabilityResult {
  const euBase = calculatePayinRegionProfitability(input.eu);
  const wwBase = calculatePayinRegionProfitability(input.ww);

  const euVolume = safeNonNegative(input.eu.volume);
  const wwVolume = safeNonNegative(input.ww.volume);
  const totalPayinVolume = euVolume + wwVolume;

  // Product correction (2026-04-29): provider MDR tiers are applied on TOTAL payin volume first,
  // then allocated back to EU/WW by volume share for regional transparency.
  const totalProviderMdrRows = calculateProviderMdrRows(
    totalPayinVolume,
    DEFAULT_PROVIDER_PAYIN_MDR_TIERS
  );
  const euShare = totalPayinVolume > 0 ? euVolume / totalPayinVolume : 0;
  const wwShare = totalPayinVolume > 0 ? wwVolume / totalPayinVolume : 0;
  const euProviderMdrRows = distributeProviderMdrRowsByShare(totalProviderMdrRows, euShare);
  const wwProviderMdrRows = distributeProviderMdrRowsByShare(totalProviderMdrRows, wwShare);

  const euProviderMdr = sumCosts(euProviderMdrRows);
  const wwProviderMdr = sumCosts(wwProviderMdrRows);

  const euCosts = {
    providerMdr: euProviderMdr,
    providerTrx: euBase.costs.providerTrx,
    schemeFees: euBase.costs.schemeFees,
    interchange: 0,
    total: euProviderMdr + euBase.costs.providerTrx + euBase.costs.schemeFees
  };
  const wwCosts = {
    providerMdr: wwProviderMdr,
    providerTrx: wwBase.costs.providerTrx,
    schemeFees: wwBase.costs.schemeFees,
    interchange: 0,
    total: wwProviderMdr + wwBase.costs.providerTrx + wwBase.costs.schemeFees
  };

  const eu: PayinRegionProfitability = {
    ...euBase,
    providerMdrRows: euProviderMdrRows,
    costs: euCosts,
    netMargin: euBase.revenue.total - euCosts.total
  };
  const ww: PayinRegionProfitability = {
    ...wwBase,
    providerMdrRows: wwProviderMdrRows,
    costs: wwCosts,
    netMargin: wwBase.revenue.total - wwCosts.total
  };

  const revenue = {
    mdr: eu.revenue.mdr + ww.revenue.mdr,
    trx: eu.revenue.trx + ww.revenue.trx,
    failedTrx: eu.revenue.failedTrx + ww.revenue.failedTrx,
    total: eu.revenue.total + ww.revenue.total
  };
  const costs = {
    providerMdr: eu.costs.providerMdr + ww.costs.providerMdr,
    providerTrx: eu.costs.providerTrx + ww.costs.providerTrx,
    schemeFees: eu.costs.schemeFees + ww.costs.schemeFees,
    interchange: eu.costs.interchange + ww.costs.interchange,
    total: eu.costs.total + ww.costs.total
  };

  return {
    eu,
    ww,
    revenue,
    costs,
    netMargin: revenue.total - costs.total
  };
}
