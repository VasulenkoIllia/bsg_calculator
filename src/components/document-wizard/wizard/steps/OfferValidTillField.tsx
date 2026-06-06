import { useEffect } from "react";
import { MiniToggle, NumberField } from "../../../calculator/index.js";
import {
  OFFER_VALID_DAYS_DEFAULT,
  OFFER_VALID_DAYS_PRESETS,
  formatIsoDdMmYyyy,
  hasExplicitOfferValidity,
  offerValidTillIso,
  resolveOfferValidDays
} from "../../../../shared/offerValidity.js";

// Wizard Step-1 control for "Offer valid till" (rendered only for offer
// scope). Stores a DAY COUNT; the valid-till DATE is derived for the live
// preview + the PDF.
//
// On mount it BACKFILLS the default for any offer that lacks an explicit
// validity (e.g. a pre-feature document opened via "use as template"), so the
// control, the live preview, and the saved payload all agree. This only
// touches the in-wizard draft of the document being built — the original
// stored document is immutable and stays unlabeled.
export function OfferValidTillField({
  documentDateIso,
  offerValidDays,
  onChange
}: {
  documentDateIso: string;
  offerValidDays: unknown;
  onChange: (days: number) => void;
}) {
  useEffect(() => {
    if (!hasExplicitOfferValidity(offerValidDays)) {
      onChange(OFFER_VALID_DAYS_DEFAULT);
    }
    // Mount-only backfill; onChange + offerValidDays are intentionally excluded
    // so this fires once rather than on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = resolveOfferValidDays(offerValidDays);
  return (
    <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <span className="field-label">Offer Valid Till</span>
      <p className="mt-1 text-xs text-slate-600">
        How long the offer stays valid from the Document Date. Rendered on the
        Commercial Pricing Schedule only.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {OFFER_VALID_DAYS_PRESETS.map(preset => (
          <MiniToggle
            key={preset}
            label={`${preset} days`}
            selected={days === preset}
            onSelect={() => onChange(preset)}
            ariaLabel={`Offer valid ${preset} days`}
          />
        ))}
      </div>
      <div className="mt-2 max-w-[220px]">
        <NumberField
          label="Custom (days)"
          value={days}
          onChange={onChange}
          min={1}
          max={365}
          step={1}
        />
      </div>
      <span className="mt-2 block text-xs font-semibold text-slate-700">
        Valid till {formatIsoDdMmYyyy(offerValidTillIso(documentDateIso, days))}
      </span>
    </div>
  );
}
