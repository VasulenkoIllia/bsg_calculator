import { formatSignedAmount } from "./formatUtils.js";
import type { UnifiedProfitabilityNode } from "./types.js";

export function UnifiedProfitabilityRow({
  node,
  level,
  expandedById,
  onToggle,
  showFormulas
}: {
  node: UnifiedProfitabilityNode;
  level: number;
  expandedById: Record<string, boolean>;
  onToggle: (id: string) => void;
  showFormulas: boolean;
}) {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded = hasChildren ? (expandedById[node.id] ?? true) : false;
  const valueClass =
    node.value < 0 ? "text-rose-600" : node.value > 0 ? "text-emerald-600" : "text-slate-700";

  return (
    <div className={level > 0 ? "border-l border-blue-200" : ""}>
      <div
        className="flex items-center justify-between gap-3 border-b border-slate-100 py-2"
        style={{ paddingLeft: `${level * 18}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.label}`}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300">•</span>
          )}
          <p className="truncate text-sm font-semibold text-slate-800">{node.label}</p>
        </div>
        <p className={["text-sm font-extrabold tabular-nums", valueClass].join(" ")}>
          {formatSignedAmount(node.value)}
        </p>
      </div>

      {showFormulas && node.formula ? (
        <p
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          style={{ marginLeft: `${level * 18 + 28}px`, marginTop: "8px", marginBottom: "8px" }}
        >
          Formula (Unified): {node.formula}
        </p>
      ) : null}

      {hasChildren && isExpanded
        ? node.children?.map(child => (
            <UnifiedProfitabilityRow
              key={child.id}
              node={child}
              level={level + 1}
              expandedById={expandedById}
              onToggle={onToggle}
              showFormulas={showFormulas}
            />
          ))
        : null}
    </div>
  );
}
