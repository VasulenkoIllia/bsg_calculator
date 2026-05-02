import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { collectExpandableNodeIds } from "../appHelpers.js";
import type { UnifiedProfitabilityNode } from "../types.js";

type UseUnifiedTreeExpansionParams = {
  unifiedProfitabilityTree: UnifiedProfitabilityNode[];
  setUnifiedExpandedById: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export function useUnifiedTreeExpansion({
  unifiedProfitabilityTree,
  setUnifiedExpandedById
}: UseUnifiedTreeExpansionParams) {
  const unifiedExpandableNodeIds = useMemo(
    () => collectExpandableNodeIds(unifiedProfitabilityTree),
    [unifiedProfitabilityTree]
  );

  useEffect(() => {
    setUnifiedExpandedById(current => {
      const next: Record<string, boolean> = {};
      for (const id of unifiedExpandableNodeIds) {
        next[id] = id in current ? current[id] : true;
      }
      return next;
    });
  }, [setUnifiedExpandedById, unifiedExpandableNodeIds]);

  const expandAllUnifiedRows = () => {
    setUnifiedExpandedById(
      unifiedExpandableNodeIds.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = true;
        return acc;
      }, {})
    );
  };

  const collapseAllUnifiedRows = () => {
    setUnifiedExpandedById(
      unifiedExpandableNodeIds.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = false;
        return acc;
      }, {})
    );
  };

  const toggleUnifiedRow = (id: string) => {
    setUnifiedExpandedById(current => ({
      ...current,
      [id]: !(current[id] ?? true)
    }));
  };

  return {
    unifiedExpandableNodeIds,
    expandAllUnifiedRows,
    collapseAllUnifiedRows,
    toggleUnifiedRow
  };
}
