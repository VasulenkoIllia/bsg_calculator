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
 * Sprint 6.9 S5 / N9: positioning notes —
 *   - The AppShell renders IdentityStrip + CalculatorHeader +
 *     WorkspaceTabs above the route Outlet, NONE of which are
 *     position:sticky. So `sticky top-0` here means "stick to the
 *     literal top of the viewport once the content above has
 *     scrolled away". On long pages this works well: the operator
 *     scrolls past Zone 0 and the toolbar follows.
 *   - On SHORT viewports (mobile, or all zones collapsed) the
 *     content doesn't overflow, sticky never engages, and the
 *     toolbar renders inline. That's the correct fallback — there's
 *     nothing to scroll past, so nothing to pin.
 *   - z-30 sits above the zone panels but BELOW the AppShell
 *     header chrome (which is non-stacking-positioned, so z-index
 *     doesn't actually compete — DOM order takes over once you
 *     scroll into the route content). If the AppShell were ever
 *     made sticky too, the toolbar's `top-0` would need to be
 *     bumped to `top-[<header-height>]`.
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
  statusSlot
}: CalculatorStickyToolbarProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur md:-mx-8 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
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
