import { MiniToggle } from "../../../../calculator/index.js";
import type {
  CustomTermsItem,
  CustomTermsItemColor,
  DocumentTemplatePayload
} from "../../../types.js";

// Cheap unique-id generator for custom Terms items. crypto.randomUUID()
// is preferred but isn't available in every JSDOM test environment, so
// we fall back to a timestamp + random string.
function generateCustomTermsId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cti-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const CUSTOM_TERMS_COLORS: ReadonlyArray<{ value: CustomTermsItemColor; label: string }> = [
  { value: "blue", label: "Purple" },
  { value: "black", label: "Black" },
  { value: "orange", label: "Orange" }
];

// Step 5 → Custom Terms Blocks card. Lets the user append free-form
// rows (heading + body + colour) to the Terms & Limitations grid in
// the OFFER PDF. The PDF appends them after the built-in rows in the
// same 2-column terms-grid layout.
export function CustomTermsBlocksSection({
  draft,
  onDraftChange
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
}) {
  const items: CustomTermsItem[] = draft.contractSummary.customTermsItems ?? [];

  const replaceItems = (next: CustomTermsItem[]) =>
    onDraftChange({
      ...draft,
      contractSummary: { ...draft.contractSummary, customTermsItems: next }
    });

  const addItem = () => {
    const next: CustomTermsItem = {
      id: generateCustomTermsId(),
      label: "",
      value: "",
      color: "blue"
    };
    replaceItems([...items, next]);
  };

  const updateItem = (id: string, patch: Partial<CustomTermsItem>) => {
    replaceItems(items.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    replaceItems(items.filter(item => item.id !== id));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">Custom Terms Blocks</p>
          <p className="mt-1 text-xs text-slate-500">
            Optional extra rows appended to the Terms &amp; Limitations grid.
            Headings render in the standard blue label colour; bodies use the
            colour you pick per row.
          </p>
        </div>
        <button
          type="button"
          onClick={addItem}
          className="shrink-0 rounded-lg border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
        >
          + Add block
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-xs italic text-slate-500">
          No custom blocks yet — click &quot;Add block&quot; to create one.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Block {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50"
                  aria-label={`Remove custom block ${index + 1}`}
                >
                  Remove
                </button>
              </div>

              <label className="mt-2 block">
                <span className="field-label">Heading</span>
                <input
                  className="field-input"
                  type="text"
                  value={item.label}
                  onChange={event =>
                    updateItem(item.id, { label: event.target.value })
                  }
                  placeholder="e.g. ** Decline fee removal"
                  aria-label={`Custom block ${index + 1} heading`}
                />
              </label>

              <label className="mt-2 block">
                <span className="field-label">Body</span>
                <textarea
                  className="field-input min-h-[72px] resize-y"
                  value={item.value}
                  onChange={event =>
                    updateItem(item.id, { value: event.target.value })
                  }
                  placeholder="Free text — appears in the chosen colour."
                  aria-label={`Custom block ${index + 1} body`}
                />
              </label>

              <div className="mt-2">
                <span className="field-label">Body colour</span>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_TERMS_COLORS.map(option => (
                    <MiniToggle
                      key={option.value}
                      label={option.label}
                      selected={item.color === option.value}
                      onSelect={() => updateItem(item.id, { color: option.value })}
                      ariaLabel={`Custom block ${index + 1} colour: ${option.label}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
