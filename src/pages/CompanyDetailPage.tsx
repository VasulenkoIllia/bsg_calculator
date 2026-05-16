/**
 * Company detail (with deals) page — full implementation in Sprint 2.8.E.
 *
 * This placeholder exists so App.tsx routes compile after 2.8.C.
 */

import { useParams } from "react-router-dom";

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <section className="panel border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-slate-900">Company {id}</h1>
      <p className="mt-2 text-sm text-slate-500">
        Detail + deals UI lands in Sprint 2.8.E — wired to GET /api/v1/companies/:id + /:id/deals.
      </p>
    </section>
  );
}
