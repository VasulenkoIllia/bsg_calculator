import type {
  PayinRegionPricingConfig,
  PayinRegionPricingPreview
} from "../../domain/calculator/index.js";
import type { UnifiedProfitabilityNode, ZoneId, ZoneNavigationTarget } from "./types.js";

export function resolveEffectiveMethodTrxFee(
  config: PayinRegionPricingConfig,
  preview: PayinRegionPricingPreview,
  method: "cc" | "apm"
): number {
  if (config.rateMode === "single") {
    return method === "cc" ? config.single.trxCc : config.single.trxApm;
  }

  const rows = preview.tierRows;
  if (rows.length === 0) {
    return method === "cc" ? config.single.trxCc : config.single.trxApm;
  }

  const weightedFee = rows.reduce((sum, row) => {
    const transactions = method === "cc" ? row.ccTransactions : row.apmTransactions;
    const fee = method === "cc" ? row.trxCc : row.trxApm;
    return sum + transactions * fee;
  }, 0);
  const totalTransactions = rows.reduce((sum, row) => {
    const transactions = method === "cc" ? row.ccTransactions : row.apmTransactions;
    return sum + transactions;
  }, 0);

  if (totalTransactions <= 0) {
    return method === "cc" ? config.tiers[0].trxCc : config.tiers[0].trxApm;
  }

  return weightedFee / totalTransactions;
}

export function resolveMethodTrxRevenue(
  config: PayinRegionPricingConfig,
  preview: PayinRegionPricingPreview,
  successfulTransactions: number,
  method: "cc" | "apm"
): number {
  if (!config.trxFeeEnabled) return 0;

  if (config.rateMode === "single") {
    return successfulTransactions * (method === "cc" ? config.single.trxCc : config.single.trxApm);
  }

  if (preview.tierRows.length === 0) return 0;

  return preview.tierRows.reduce((sum, row) => {
    const transactions = method === "cc" ? row.ccTransactions : row.apmTransactions;
    const fee = method === "cc" ? row.trxCc : row.trxApm;
    return sum + transactions * fee;
  }, 0);
}

export function collectExpandableNodeIds(nodes: UnifiedProfitabilityNode[]): string[] {
  const ids: string[] = [];

  const walk = (node: UnifiedProfitabilityNode) => {
    if (node.children && node.children.length > 0) {
      ids.push(node.id);
      node.children.forEach(walk);
    }
  };

  nodes.forEach(walk);
  return ids;
}

export function findPreviousZoneTarget(
  zoneId: ZoneId,
  zones: ZoneNavigationTarget[]
): ZoneNavigationTarget | undefined {
  const zoneIndex = zones.findIndex(zone => zone.id === zoneId);
  return zoneIndex > 0 ? zones[zoneIndex - 1] : undefined;
}
