export function PreviewStep({
  previewHtml,
  onBack,
  onGeneratePdf
}: {
  previewHtml: string;
  onBack: () => void;
  onGeneratePdf: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 6. Preview + Generate PDF</h3>
      <p className="mt-1 text-sm text-slate-600">
        Preview is rendered from the current wizard data. In calculator source mode, unavailable
        blocks are hidden.
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <iframe
          title="Offer PDF Preview"
          srcDoc={previewHtml}
          className="h-[780px] w-full bg-white"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Back to Step 5
        </button>
        <button
          type="button"
          onClick={onGeneratePdf}
          className="rounded-xl border border-blue-300 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Generate PDF
        </button>
      </div>
    </div>
  );
}
