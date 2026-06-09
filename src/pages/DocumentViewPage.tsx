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

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { downloadSavedPdf, triggerPdfDownload } from "../api/pdf.js";
import { buildOfferPdfHtml } from "../components/document-wizard/index.js";
import type { DocumentTemplatePayload } from "../components/document-wizard/index.js";
import { DeleteDocumentModal } from "../components/DeleteDocumentModal.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { DocumentOfferStatus } from "../components/OfferStatusBadge.js";
import { EventHistoryPanel } from "../components/EventHistoryPanel.js";
import { useAuth } from "../contexts/AuthContext.js";
import { useToast } from "../contexts/ToastContext.js";
import { useDocument } from "../hooks/useDocuments.js";
import { formatDateTime, formatScopeLabel } from "../shared/format.js";
// Audit dedup — humanReason now lives in the shared deletionReason
// module (was copy-pasted here + in both list pages).
import { humanReason } from "../shared/deletionReason.js";

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
  // NOTE: this is a SHALLOW check — only the four top-level keys
  // buildOfferPdfHtml dereferences first are validated. A deeper-
  // nested mismatch (e.g. payload.layout missing a required sub-
  // field) will surface as a thrown error inside buildOfferPdfHtml,
  // which the caller catches and turns into a fallback banner. The
  // cast below is therefore a "passes the entrance check" claim,
  // not a "fully validated" claim — the deeper validation is the
  // try/catch around `buildOfferPdfHtml` itself.
  return p as unknown as DocumentTemplatePayload;
}


export function DocumentViewPage() {
  const { number } = useParams<{ number: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const docQuery = useDocument(number, { pollWhileSyncing: true });
  // Phase 8 Stage 4 — events list, used by the History panel below
  // the document body. `enabled: !!number` guards against a hook
  // call before the route param hydrates.
  const eventsQuery = useQuery({
    queryKey: ["document-events", number],
    queryFn: () => documentsApi.listDocumentEvents(number!),
    enabled: !!number,
    staleTime: 15_000
  });
  const [templatePending, setTemplatePending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  // Guards against a same-tick double-click firing two sync requests
  // before `syncPending` (async state) re-renders the disabled button.
  // The backend advisory lock is the real safety net; this stops the
  // duplicate at the source so the second click never leaves the page.
  const syncInFlightRef = useRef(false);
  const [restorePending, setRestorePending] = useState(false);
  const [showRawPayload, setShowRawPayload] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [resyncConfirmOpen, setResyncConfirmOpen] = useState(false);

  // Phase 8 Stage 5 — super_admin restore action.
  async function handleRestore(): Promise<void> {
    if (!number) return;
    setRestorePending(true);
    try {
      await documentsApi.restoreDocument(number);
      toast.success(`Restored ${number}`);
      // Invalidate the doc + events caches so the page re-renders
      // with the soft-delete metadata cleared.
      await queryClient.invalidateQueries({ queryKey: ["document", number] });
      await queryClient.invalidateQueries({
        queryKey: ["document-events", number]
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Restore failed.";
      toast.error(msg);
    } finally {
      setRestorePending(false);
    }
  }

  async function handleUseAsTemplate(): Promise<void> {
    if (!number) return;
    setTemplatePending(true);
    try {
      const result = await documentsApi.useDocumentAsTemplate(number);
      // Open the WIZARD directly — the template payload is already a
      // wizard draft. The wizard detects the linked-config payload shape
      // and loads it; `?calc=` also auto-links the inherited company/deal.
      navigate(`/wizard?calc=${result.configId}`);
    } catch (err) {
      // Sprint 6.3: surface failures via the global toast viewport
      // instead of an inline alert beside the button — keeps the
      // mutation feedback consistent across the app.
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not create a template from this document — try again."
      );
    } finally {
      setTemplatePending(false);
    }
  }

  // PDF download routes through the shared src/api/pdf.ts helpers
  // (Sprint 6.F.1 audit Q1 — was previously inline-duplicated here).
  // axios pipes the response through our existing interceptors
  // (refresh-on-401, ApiError envelope), then triggerPdfDownload
  // wraps the Buffer in a Blob URL + hidden-anchor click + revoke.
  const [pdfPending, setPdfPending] = useState(false);

  async function handleDownloadPdf(): Promise<void> {
    if (!number) return;
    setPdfPending(true);
    try {
      const blob = await downloadSavedPdf(number);
      triggerPdfDownload(blob, `${number}.pdf`);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        console.error("[DocumentViewPage] PDF download unexpected", err);
        toast.error("Failed to download PDF.");
      }
    } finally {
      setPdfPending(false);
    }
  }

  /**
   * Phase 9 — Sync this document to HubSpot as a Note. The backend
   * mints a NEW Note each time (audit trail in HubSpot); we
   * invalidate the documents listings so the badge update propagates
   * to /documents and any nested company tab.
   */
  async function handleSyncToHubspot(): Promise<void> {
    if (!number) return;
    // Re-entry guard: a same-tick double-click can fire this twice
    // before `setSyncPending(true)` re-renders the disabled button —
    // and each call mints a separate HubSpot Note.
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncPending(true);
    try {
      const updated = await documentsApi.syncDocumentToHubspot(number);
      // Optimistically replace the cached single-doc query so the badge
      // flips immediately; the `finally` invalidate then reconciles.
      // Query key shape: ["documents", "get", number] — see useDocument().
      queryClient.setQueryData(["documents", "get", number], updated);
      toast.success("Document synced to HubSpot.");
    } catch (err) {
      // 409 = a concurrent sync is already running (backend advisory
      // lock). NOT a failure — the other run finishes and updates the
      // badge; show a soft info toast, not a scary "Sync failed". Any
      // other error means the backend already persisted state='failed'.
      if (err instanceof ApiError && err.code === "HUBSPOT_SYNC_IN_PROGRESS") {
        toast.info("Sync already in progress — the badge will update shortly.");
      } else {
        toast.error(
          err instanceof ApiError
            ? `Sync failed: ${err.message}`
            : "Sync failed — try again."
        );
      }
    } finally {
      // Unconditional: refresh the single-doc + listings so the badge
      // reflects the real server state on success, 409, AND failure.
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSyncPending(false);
      syncInFlightRef.current = false;
    }
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
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {formatScopeLabel(doc.scope)}
            </p>
            <h1 className="font-mono text-xl font-semibold text-slate-900">
              {doc.number}
            </h1>
            <p className="text-sm text-slate-500">Created {formatDateTime(doc.createdAt)}</p>
            <DocumentOfferStatus scope={doc.scope} payload={doc.payload} className="mt-1" />
          </div>
          {/*
            Phase 9 — HubSpot sync status badge. Three states:
              - not_synced: neutral grey "Not synced"
              - synced: green "✓ Synced to HubSpot"
              - failed: red "Sync failed"
            Mirrors the badge on the /documents listing row but
            larger + more prominent here on the detail page.
          */}
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold",
              doc.hubspotSyncState === "synced"
                ? "bg-green-100 text-green-700"
                : doc.hubspotSyncState === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-600"
            ].join(" ")}
            title={
              doc.hubspotNoteId
                ? `Latest HubSpot Note id: ${doc.hubspotNoteId}`
                : undefined
            }
          >
            {doc.hubspotSyncState === "synced"
              ? "✓ Synced to HubSpot"
              : doc.hubspotSyncState === "failed"
                ? "× Sync failed"
                : "Not synced"}
          </span>
        </header>

        {doc.addendum ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong className="font-semibold">Addendum:</strong> {doc.addendum}
          </div>
        ) : null}

        {/* Phase 8 Stage 5 — soft-delete banner. Shows when the
            document has been retracted. Carries reason + note for
            context; super_admin sees a Restore button below. */}
        {doc.deletedAt ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-semibold">
              Deleted · {new Date(doc.deletedAt).toLocaleString()}
            </p>
            {/* Sprint 9.O — show WHO deleted the doc so the audit trail
                is visible alongside the timestamp. `deletedBy` comes
                from a LEFT JOIN on users.deleted_by_user_id; if the
                deleter row was hard-deleted (shouldn't happen — users
                are soft-deleted via isActive=false — but defensively)
                we just omit the line. */}
            {doc.deletedBy ? (
              <p className="mt-1">
                <span className="font-semibold">Deleted by: </span>
                {doc.deletedBy.displayName}{" "}
                <span className="text-red-700">({doc.deletedBy.email})</span>
              </p>
            ) : null}
            {doc.deletionReason ? (
              <p className="mt-1">
                <span className="font-semibold">Reason: </span>
                {humanReason(doc.deletionReason)}
              </p>
            ) : null}
            {doc.deletionNote ? (
              <p className="mt-1 whitespace-pre-wrap text-red-800">
                <span className="font-semibold">Note: </span>
                {doc.deletionNote}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-red-700">
              The BSG number stays reserved. PDF download is still allowed for
              audit purposes.
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfPending ? "Preparing PDF…" : "Download PDF"}
          </button>
          {/* Sprint 9.R — admin+ only. POST /documents/:number/use-as-template
              creates a new document, which `user` (read-only) can't do. */}
          {hasRole("admin") ? (
            <button
              type="button"
              onClick={handleUseAsTemplate}
              disabled={templatePending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {templatePending ? "Creating draft…" : "Use as Template"}
            </button>
          ) : null}
          {/*
            Phase 9 — HubSpot Note write-back. Admin-only on the
            backend (requireRole('admin')); same gate here so the
            button is hidden for plain `user` accounts that would
            get a 403 anyway. Label reflects current sync state +
            whether this would create a fresh Note (the backend's
            "create new each time" policy) or retry after a
            previous failure.
          */}
          {/* Sync button hidden when the doc is soft-deleted —
              server would 404 anyway. */}
          {hasRole("admin") && !doc.deletedAt ? (
            <button
              type="button"
              onClick={() => {
                // Re-syncing an already-synced doc creates a NEW HubSpot
                // Note — confirm first so it's not an accidental duplicate.
                if (doc.hubspotSyncState === "synced") setResyncConfirmOpen(true);
                else void handleSyncToHubspot();
              }}
              disabled={syncPending}
              className="rounded-lg border border-blue-500 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncPending
                ? "Syncing…"
                : doc.hubspotSyncState === "synced"
                  ? "Sync again to HubSpot"
                  : doc.hubspotSyncState === "failed"
                    ? "Retry HubSpot sync"
                    : doc.hubspotSyncState === "delete_failed"
                      ? "Retry delete"
                      : "Sync to HubSpot"}
            </button>
          ) : null}
          {/* Phase 8 Stage 5 — Delete (admin) / Restore (super_admin)
              swap based on the doc's deleted_at state. */}
          {hasRole("admin") && !doc.deletedAt ? (
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="rounded-lg border border-red-500 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
            >
              Delete document
            </button>
          ) : null}
          {hasRole("super_admin") && doc.deletedAt ? (
            <button
              type="button"
              onClick={handleRestore}
              disabled={restorePending}
              className="rounded-lg border border-green-500 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {restorePending ? "Restoring…" : "Restore document"}
            </button>
          ) : null}
        </div>
        {/* Phase 8 Stage 5 — modal lives at page root so the form
            unmounts cleanly on close. */}
        {number ? (
          <DeleteDocumentModal
            open={deleteModalOpen}
            documentNumber={number}
            hasHubspotNote={doc.hubspotNoteId !== null}
            onClose={() => setDeleteModalOpen(false)}
            onDeleted={() => {
              setDeleteModalOpen(false);
              toast.success(`Deleted ${number}`);
              navigate("/documents");
            }}
          />
        ) : null}
        <ConfirmDialog
          open={resyncConfirmOpen}
          title="Sync again to HubSpot?"
          message="This document is already synced. Syncing again creates a NEW HubSpot Note (the previous one stays as history)."
          confirmLabel="Sync again"
          pending={syncPending}
          onCancel={() => setResyncConfirmOpen(false)}
          onConfirm={() => {
            setResyncConfirmOpen(false);
            void handleSyncToHubspot();
          }}
        />
        {/*
          Sprint 6.3: PDF + template errors now flow through the
          global toast viewport (top-right) instead of inline beside
          the buttons. Keeps mutation feedback consistent across the
          whole app.
        */}
      </div>

      {/* Sprint 9.R — collapsible audit-trail panel moved UP, right
          after the action buttons. Operator brief: "Історію документу
          перенести вище до інших кнопок щоб було зручніше" — the
          history is operationally co-located with the actions
          (created → synced → deleted → restored), so reading it
          next to the buttons is the natural flow. The preview
          (still long) sits below. */}
      <EventHistoryPanel
        events={eventsQuery.data?.items ?? []}
        isLoading={eventsQuery.isLoading}
        isError={eventsQuery.isError}
      />

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
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <iframe
          title={`Document ${number} preview`}
          srcDoc={previewHtml}
          // Sandbox keeps any styles inside the iframe from leaking
          // into the SPA. Empty sandbox is the most restrictive mode
          // (no scripts, no forms, no popups, no same-origin access).
          // `allow=""` explicitly disables every Permissions Policy
          // feature (camera, microphone, geolocation, etc.) as
          // defence-in-depth.
          sandbox=""
          allow=""
          className="h-[780px] w-full bg-white"
        />
      </div>
    </div>
  );
}
