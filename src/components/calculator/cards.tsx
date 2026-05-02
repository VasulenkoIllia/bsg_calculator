import type { ReactNode } from "react";

export function MetricCard({
  name,
  value,
  className = ""
}: {
  name: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={["metric-card", className].join(" ")}>
      <p className="metric-name">{name}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

export function FormulaLine({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={[
        "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600",
        className
      ].join(" ")}
    >
      {children}
    </p>
  );
}
