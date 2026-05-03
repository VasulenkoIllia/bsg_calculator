import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="panel mx-auto mt-6 max-w-3xl p-6">
      <h2 className="zone-title">Page not found</h2>
      <p className="mt-3 text-sm text-slate-600">
        The route you opened is not handled by this app.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/calculator"
          className="rounded-xl border border-blue-300 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Open Calculator
        </Link>
        <Link
          to="/wizard"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Open Contract Wizard
        </Link>
      </div>
    </section>
  );
}
