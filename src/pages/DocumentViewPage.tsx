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

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { buildOfferPdfHtml } from "../components/document-wizard/index.js";
import type { DocumentTemplatePayload } from "../components/document-wizard/index.js";
import { useDocument } from "../hooks/useDocuments.js";
import { formatDate } from "../shared/format.js";

/**
 * Best-effort runtime check that `payload` carries a wizard-style
 * DocumentTemplatePayload. The strict TypeScript shape lives on the
 * frontend only — backend stores it as opaque JSONB — so the preview
 * has to verify the structural prerequisites before feeding the
 * payload to `buildOfferPdfHtml`, otherwise a missing field would
 * throw at render time and crash the page.
 *
 * Returns the typed value or null. We accept any object that carries
 * the four MUST-HAVE top-level keys the builder dereferences first;
 * any deeper-shape mismatch surfaces as a wizard-rendering error
 * (caught and turned into a fallback render below).
 */
function asWizardPayload(payload: unknown): DocumentTemplatePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.documentScope !== "string" ||
    typeof p.header !== "object" ||
    typeof p.layout !== "object" ||
    typeof p.agreementParties !== "object"
  ) {
    return null;
  }
  return p as unknown as DocumentTemplatePayload;
}

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
      </div>

      {/* Document preview — same iframe-rendered HTML as the wizard's
          Preview step, fed by the frontend's buildOfferPdfHtml using
          the payload stored on save. We compute this lazily so a
          payload that doesn't conform to DocumentTemplatePayload
          (e.g. a calc-only snapshot from an earlier save) doesn't
          crash the page — we fall back to the raw JSON view. */}
      <DocumentPreviewSection payload={doc.payload} number={doc.number} />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <details
          open={showRawPayload}
          onToggle={e => setShowRawPayload(e.currentTarget.open)}
        >
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

/**
 * Renders the document preview from the persisted payload. Two cases:
 *
 *   1. Payload IS a valid wizard DocumentTemplatePayload (Sprint 4.E
 *      saves go through this path) → render the same HTML the wizard
 *      Preview step renders, inside a sandboxed iframe.
 *
 *   2. Payload was saved from somewhere else (e.g. a future calc-only
 *      save path) → show an info banner and rely on the Raw payload
 *      collapsible below for inspection.
 *
 * The rendering call is wrapped in useMemo + try/catch so a deeper
 * mismatch (missing nested fields buildOfferPdfHtml dereferences)
 * surfaces as a graceful fallback rather than a render crash.
 */
function DocumentPreviewSection({
  payload,
  number
}: {
  payload: unknown;
  number: string;
}) {
  const wizardPayload = asWizardPayload(payload);
  const previewHtml = useMemo(() => {
    if (!wizardPayload) return null;
    try {
      return buildOfferPdfHtml(wizardPayload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[DocumentViewPage] buildOfferPdfHtml threw on document",
        number,
        err
      );
      return null;
    }
  }, [wizardPayload, number]);

  if (!wizardPayload || !previewHtml) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Preview not available</p>
        <p className="mt-1">
          The saved payload doesn&apos;t match the wizard&apos;s
          DocumentTemplatePayload shape — likely a calc-only snapshot
          or an older draft. The raw payload is still visible in the
          debug view below.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Document preview</h2>
        <span className="text-xs text-slate-500">
          Same render the wizard uses · click Download PDF for the print version
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <iframe
          title={`Document ${number} preview`}
          srcDoc={previewHtml}
          // Sandbox keeps any styles inside the iframe from leaking
          // into the SPA. We don't allow scripts because our generated
          // HTML never includes any.
          sandbox=""
          className="h-[780px] w-full bg-white"
        />
      </div>
    </div>
  );
}
