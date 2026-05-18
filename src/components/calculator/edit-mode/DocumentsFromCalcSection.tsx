/**
 * "Documents from this calculator" history strip — surfaces the
 * BSG-XXXXX documents that were saved from a specific
 * calculator-config so the operator can see, at a glance, every
 * point-in-time snapshot derived from the live draft they're editing.
 *
 * One calc → many documents is the canonical relationship (each save
 * via the wizard produces a fresh numbered document); this section
 * makes that visible. Clicking a row opens the document view.
 *
 * Rendered only when the list is non-empty: the calc page already
 * has dense UX and a "0 documents derived yet" banner would be noise.
 *
 * Sprint 6.F.2 extracted from CalculatorPage.tsx (was an inline
 * subcomponent in a 680-LOC page file).
 */

import { Link } from "react-router-dom";
import type { PublicDocument } from "../../../api/types.js";
import { formatDate, formatScopeLabel } from "../../../shared/format.js";

export function DocumentsFromCalcSection({ docs }: { docs: PublicDocument[] }) {
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Documents from this calculator{" "}
          <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-700">
            {docs.length}
          </span>
        </h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {docs.map(doc => (
          <li key={doc.id}>
            <Link
              to={`/documents/${doc.number}`}
              className="flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-50"
            >
              <span className="font-mono text-xs font-semibold text-slate-800">
                {doc.number}
              </span>
              <span className="text-xs text-slate-500">
                {formatScopeLabel(doc.scope)} · {formatDate(doc.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
