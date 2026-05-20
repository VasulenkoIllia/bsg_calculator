/**
 * Sticky action bar at the top of the calculator page — Sprint 6.8.
 *
 * Closes a navigation friction flagged in the post-6.7 review:
 * the only way to get from the calculator to the Contract Wizard
 * was to scroll all the way down to Zone 6's Export Actions and
 * click "Open Contract Wizard" there. With six zones full of
 * inputs, the wizard CTA was effectively below-the-fold.
 *
 * This toolbar duplicates the wizard CTA (and the "Save calculator"
 * CTA in new-draft mode) into a sticky strip that pins to the top
 * of the scroll viewport.
 *
 * Sprint 7.1 positioning notes (revised):
 *   - The AppHeader at z-40 + `sticky top-0` pins the workspace
 *     navigation to the literal viewport top.
 *   - This toolbar at z-30 + `sticky top-12` pins DIRECTLY UNDER
 *     the AppHeader. `top-12` (48px in Tailwind) matches the
 *     AppHeader's measured height on desktop; on mobile the
 *     AppHeader is slightly shorter so the toolbar may show a
 *     1–2px gap below the bar, which reads as a clean divider
 *     rather than a defect.
 *   - z-30 < z-40 means if either pins overlap visually at any
 *     scroll position, the AppHeader stays on top — the toolbar
 *     never covers the workspace tabs.
 *   - On SHORT viewports / all-zones-collapsed pages the content
 *     doesn't overflow, sticky never engages, and the toolbar
 *     renders inline. That's the correct fallback — there's
 *     nothing to scroll past, so nothing to pin.
 */

import { type ReactNode } from "react";

export interface CalculatorStickyToolbarProps {
  /**
   * Pencilled "draft title" or "(untitled)" if absent. Echoed in
   * the toolbar so the operator knows which draft they're acting
   * on — helpful when juggling multiple calc browser tabs. Pass
   * null to suppress the badge entirely (new-draft mode).
   */
  draftTitle: string | null;
  /**
   * Wire to the same wizard navigation as Zone 6's Export Actions
   * (CalculatorPage owns the redirect URL — it knows whether to
   * pass `?calc=:id` based on edit-mode).
   */
  onOpenWizard: () => void;
  /**
   * Wire to the same Save-modal opener as Zone 6. Pass `null` /
   * `undefined` in edit mode — auto-save replaces the explicit
   * Save flow and showing the button would suggest otherwise.
   */
  onSaveCalculator?: () => void;
  /**
   * Sprint 7.2: toggle for the "Hardcoded constants & formulas"
   * panel + the labelled current state. Migrated from the standalone
   * CalculatorActionsPanel so the calculator's three secondary
   * actions live next to the primary wizard/save CTAs.
   */
  showHardcodedConstants: boolean;
  onToggleConstantsAndFormulas: () => void;
  /** Sprint 7.2: reset every input back to 0 (formerly CalculatorActionsPanel). */
  onReset: () => void;
  /** Sprint 7.2: apply the production defaults (formerly CalculatorActionsPanel). */
  onApplyDefaults: () => void;
  /**
   * Optional status content rendered between the title and the
   * action buttons (e.g. an inline auto-save indicator). Keeps
   * this component dumb about what state it might show.
   */
  statusSlot?: ReactNode;
}

export function CalculatorStickyToolbar({
  draftTitle,
  onOpenWizard,
  onSaveCalculator,
  showHardcodedConstants,
  onToggleConstantsAndFormulas,
  onReset,
  onApplyDefaults,
  statusSlot
}: CalculatorStickyToolbarProps) {
  // Shared button class for the SECONDARY (slate-bordered) actions
  // group. Kept inline rather than extracted to a styled component
  // because the variation surface is tiny (only the label differs).
  const secondaryBtn =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50";

  return (
    <div className="sticky top-12 z-30 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur md:-mx-8 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        {/* Left: identity. Calculator label + title chip + optional
            inline status (e.g. saved-status indicator). */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Calculator
          </span>
          {draftTitle !== null ? (
            <span
              className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
              title={draftTitle}
            >
              {draftTitle}
            </span>
          ) : null}
          {statusSlot ? (
            <span className="text-xs text-slate-500">{statusSlot}</span>
          ) : null}
        </div>
        {/* Right: action group, two visual rows on narrow viewports.
            Sprint 7.2: secondary actions (Show constants / Reset 0 /
            Apply defaults) sit BEFORE the primary CTAs (Save / Wizard)
            so the eye reads the page-altering actions first and the
            commit-flow actions last. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Secondary actions — migrated from CalculatorActionsPanel
              (Sprint 7.2 — was a separate panel that pushed the zones
              down; now lives alongside the wizard CTA so the calc
              has a single action surface). */}
          <button
            type="button"
            onClick={onToggleConstantsAndFormulas}
            className={secondaryBtn}
            aria-pressed={showHardcodedConstants}
          >
            {showHardcodedConstants
              ? "Hide constants & formulas"
              : "Show constants & formulas"}
          </button>
          <button type="button" onClick={onReset} className={secondaryBtn}>
            Reset all to 0
          </button>
          <button
            type="button"
            onClick={onApplyDefaults}
            className={secondaryBtn}
          >
            Apply defaults
          </button>
          {/* Visual divider between secondary cluster and primary CTAs. */}
          <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-slate-200 md:block" />
          {/* Primary CTAs. */}
          {onSaveCalculator ? (
            <button
              type="button"
              onClick={onSaveCalculator}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Save calculator
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenWizard}
            className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Open Contract Wizard
          </button>
        </div>
      </div>
    </div>
  );
}
