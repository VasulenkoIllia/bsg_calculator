export function PreviewStep({
  previewHtml,
  highlightVariables,
  onHighlightVariablesChange,
  onBack,
  onGeneratePdf
}: {
  previewHtml: string;
  highlightVariables: boolean;
  onHighlightVariablesChange: (next: boolean) => void;
  onBack: () => void;
  onGeneratePdf: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Preview + Generate PDF</h3>
      <p className="mt-1 text-sm text-slate-600">
        Preview is rendered from the current wizard data. In calculator source mode, unavailable
        blocks are hidden. Use the highlight toggle to spot edited values; the generated PDF
        stays clean (highlights are screen-only).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={highlightVariables}
            onChange={event => onHighlightVariablesChange(event.target.checked)}
          />
          <span className="font-medium text-slate-700">Highlight variables</span>
        </label>
        <span className="text-xs text-slate-500">
          Yellow = filled by user · Indigo = default · Orange = unfilled placeholder
        </span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <iframe
          title="Document Preview"
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
          Back
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
