/**
 * Document view — /documents/:number.
 *
 * Renders:
 *   - Header (number, scope, addendum if present, created date,
 *     HubSpot sync chip).
 *   - Download PDF button → opens /api/v1/documents/:number/pdf in
 *     a new tab. Until Sprint 4.E ships the shared template module,
 *     the backend returns 501 NOT_IMPLEMENTED — UI surfaces the
 *     message gracefully.
 *   - Use as Template button → POST /:number/use-as-template →
 *     redirect to /calc/:newConfigId.
 *   - Raw payload preview (collapsed by default) for debugging.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { useDocument } from "../hooks/useDocuments.js";
import { formatDate } from "../shared/format.js";

function scopeLabel(scope: string): string {
  switch (scope) {
    case "offer":
      return "Offer";
    case "agreement":
      return "Agreement";
    case "offer_and_agreement":
      return "Offer + Agreement";
    default:
      return scope;
  }
}

export function DocumentViewPage() {
  const { number } = useParams<{ number: string }>();
  const navigate = useNavigate();
  const docQuery = useDocument(number);
  const [templatePending, setTemplatePending] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState(false);

  async function handleUseAsTemplate(): Promise<void> {
    if (!number) return;
    setTemplatePending(true);
    setTemplateError(null);
    try {
      const result = await documentsApi.useDocumentAsTemplate(number);
      navigate(result.redirectUrl);
    } catch (err) {
      setTemplateError(err instanceof ApiError ? err.message : "Failed to use as template.");
    } finally {
      setTemplatePending(false);
    }
  }

  function handleDownloadPdf(): void {
    if (!number) return;
    // Open in a new tab so the user doesn't lose the document view.
    // The Authorization header isn't automatically attached for
    // window.open() — backend requires Bearer. Sprint 4.E will
    // either:
    //   (a) Use a one-time signed download URL (?token=xxx)
    //   (b) Fetch the blob via axios + create a temp Blob URL
    //
    // For now, open the URL; the backend returns 501 (no template
    // module yet) and the user sees that response.
    window.open(`/api/v1/documents/${number}/pdf?download=true`, "_blank");
  }

  if (docQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading document…</p>;
  }
  if (docQuery.isError) {
    const msg = docQuery.error instanceof ApiError ? docQuery.error.message : "Unexpected error";
    return (
      <p className="text-sm text-red-600">Failed to load document: {msg}</p>
    );
  }
  const doc = docQuery.data;
  if (!doc) {
    return <p className="text-sm text-slate-500">Document not found.</p>;
  }

  return (
    <section className="space-y-6">
      <Link
        to="/documents"
        className="inline-block text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
      >
        ← All documents
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {scopeLabel(doc.scope)}
          </p>
          <h1 className="font-mono text-xl font-semibold text-slate-900">
            {doc.number}
          </h1>
          <p className="text-sm text-slate-500">Created {formatDate(doc.createdAt)}</p>
        </header>

        {doc.addendum ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong className="font-semibold">Addendum:</strong> {doc.addendum}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={handleUseAsTemplate}
            disabled={templatePending}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {templatePending ? "Creating draft…" : "Use as Template"}
          </button>
        </div>

        {templateError ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {templateError}
          </p>
        ) : null}

        <details className="mt-6" open={showRawPayload} onToggle={e => setShowRawPayload(e.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 hover:text-slate-900">
            Raw payload (debug view)
          </summary>
          <pre className="mt-3 max-h-[400px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(doc.payload, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
}
