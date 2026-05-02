import { DEFAULT_PROVIDER_PAYOUT_MDR_TIERS } from "./constants.js";
import {
  calculatePayoutProviderTrxRows,
  calculateProviderMdrRows,
  safeNonNegative,
  sumCosts
} from "./internals.js";
import type { PayoutProfitabilityInput, PayoutProfitabilityResult } from "./types.js";

export function calculatePayoutProfitability(
  input: PayoutProfitabilityInput
): PayoutProfitabilityResult {
  const volume = safeNonNegative(input.volume);
  const totalTransactions = safeNonNegative(input.totalTransactions);
  const mdrRevenue = safeNonNegative(input.mdrRevenue);
  const trxRevenue = safeNonNegative(input.trxRevenue);

  const providerMdrRows = calculateProviderMdrRows(volume, DEFAULT_PROVIDER_PAYOUT_MDR_TIERS);
  const providerMdr = sumCosts(providerMdrRows);

  const providerTrxRows = calculatePayoutProviderTrxRows(volume, totalTransactions);
  const providerTrx = sumCosts(providerTrxRows);

  const revenueTotal = mdrRevenue + trxRevenue;
  const costsTotal = providerMdr + providerTrx;

  return {
    revenue: {
      mdr: mdrRevenue,
      trx: trxRevenue,
      total: revenueTotal
    },
    costs: {
      providerMdr,
      providerTrx,
      total: costsTotal
    },
    providerMdrRows,
    providerTrxRows,
    netMargin: revenueTotal - costsTotal
  };
}
