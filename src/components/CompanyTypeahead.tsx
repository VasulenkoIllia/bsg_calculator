/**
 * CompanyTypeahead — shared dropdown picker for selecting a single
 * company from the synced HubSpot list.
 *
 * Sprint 6.6 UX rework: previously each call site (SaveCalculatorModal,
 * WizardBackendBar, DocumentsListPage's CompanyFilter) inlined the
 * same JSX with a `>= 2 chars` gate before the dropdown appeared.
 * Operators reported they had no idea the search was a picker until
 * they accidentally typed something — discoverability fail.
 *
 * Now:
 *   - The dropdown opens on FOCUS (no typing required). Empty query
 *     returns the first 10 companies, so the operator can browse.
 *   - Typing narrows the list (substring search, pg_trgm-backed).
 *   - Selecting a company shows a "chip" with "Change" button to
 *     reopen the picker. Same pattern across all three call sites.
 *
 * Blur handling: the listbox uses `onMouseDown` (not `onClick`) on
 * the <li> rows because `onBlur` of the input fires BEFORE click,
 * which would hide the dropdown before the click registers. Using
 * mousedown — which fires before blur — lets us cancel the blur
 * (or just race correctly) so the selection lands.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { PublicCompany } from "../api/types.js";
import { useCompanySearch } from "../hooks/useCompanySearch.js";

export interface CompanyTypeaheadProps {
  /** Currently selected company (renders as a chip when set). */
  selected: PublicCompany | null;
  /** Fires when the operator picks or clears a company. */
  onSelectedChange: (company: PublicCompany | null) => void;
  /** Label rendered above the input. */
  label?: string;
  /** Placeholder text inside the input. */
  placeholder?: string;
  /** Width preset — pickers vary (modal narrow vs. filter wide). */
  className?: string;
  /** True when the field is required → asterisk in label. */
  required?: boolean;
}

export function CompanyTypeahead({
  selected,
  onSelectedChange,
  label = "Company",
  placeholder = "Click to browse, or type to filter…",
  className = "w-full",
  required = false
}: CompanyTypeaheadProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const companySearch = useCompanySearch(query);
  // Stable id pair so the <label htmlFor=…> binds to <input id=…>
  // — required for getByLabelText() in tests and for screen
  // readers to announce the label when focus lands on the input.
  const inputId = useId();

  // Close dropdown when clicking outside the component. Cleaner than
  // onBlur (which fires before child onMouseDown) and matches the
  // expectation that clicking the document body dismisses the picker.
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  if (selected) {
    return (
      <div className={`space-y-1 ${className}`}>
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
        >
          {label}
          {required ? " *" : ""}
        </label>
        <div className="flex items-center justify-between rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm">
          <span className="truncate font-semibold text-blue-900">{selected.name}</span>
          <button
            type="button"
            onClick={() => {
              onSelectedChange(null);
              setOpen(true);
            }}
            className="ml-2 shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative space-y-1 ${className}`}>
      <label
        htmlFor={inputId}
        className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
      >
        {label}
        {required ? " *" : ""}
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        // onChange ALSO opens the dropdown — covers operators who
        // start typing immediately on a fresh field (no prior focus
        // event needed) and synthetic-event tests that simulate
        // change without focus.
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg"
        >
          {companySearch.isLoading ? (
            <li className="px-3 py-2 text-slate-500">Searching…</li>
          ) : companySearch.items.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">
              {companySearch.effectiveQuery.length > 0
                ? `No matches for "${companySearch.effectiveQuery}"`
                : "No companies synced yet."}
            </li>
          ) : (
            companySearch.items.map(c => {
              const pick = (ev?: React.SyntheticEvent) => {
                ev?.preventDefault();
                onSelectedChange(c);
                setQuery("");
                setOpen(false);
              };
              return (
                <li
                  key={c.id}
                  role="option"
                  aria-selected="false"
                  // Both handlers wire to the same picker:
                  //   - onMouseDown fires BEFORE the input's onBlur,
                  //     so the selection lands even when blur would
                  //     otherwise hide the dropdown first (real-user
                  //     pointer interaction).
                  //   - onClick covers fireEvent.click() in tests,
                  //     keyboard activation, and assistive-tech taps
                  //     that don't synthesise a mousedown event.
                  onMouseDown={pick}
                  onClick={pick}
                  className="cursor-pointer px-3 py-2 hover:bg-blue-50"
                >
                  {c.name}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
