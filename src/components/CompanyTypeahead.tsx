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
 * Behaviour:
 *   - Dropdown opens on focus AND on typing. Empty query returns the
 *     first 10 companies, so the operator can browse without typing.
 *   - Click-outside dismisses (document-level mousedown listener).
 *   - Escape key closes (WAI-ARIA combobox requirement).
 *   - Arrow Up/Down navigates the listbox.
 *   - Enter selects the currently highlighted option.
 *   - Pointer click selects via onMouseDown (NOT onClick) because
 *     mousedown fires before the input's onBlur, so the selection
 *     lands before any blur-driven close. `ev.preventDefault()` on
 *     mousedown also suppresses the synthesized click that would
 *     otherwise fire pick() twice.
 *   - Selecting renders a chip with a "Change" button to reopen.
 *
 * ARIA: implements the combobox pattern per WAI-ARIA APG.
 *   role=combobox on the input + aria-expanded + aria-controls →
 *   listbox id. Highlighted option carries aria-selected=true and is
 *   referenced via aria-activedescendant on the input.
 *
 * Sprint 6.7 hardening:
 *   - Fixed double-fire on real pointer clicks (onMouseDown + onClick
 *     both wired to pick → click event also fires after mouseup →
 *     onSelectedChange invoked twice). Now only onMouseDown.
 *   - Added Escape + arrow-key navigation (keyboard users were
 *     locked out — Tab moved focus OUT of the input, no way to
 *     reach the listbox).
 *   - Stopped declaring htmlFor in the chip branch where no input
 *     is rendered (dangling reference).
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const companySearch = useCompanySearch(query);

  // Stable id pair so the <label htmlFor=…> binds to <input id=…> —
  // required for getByLabelText() in tests and for screen readers
  // to announce the label when focus lands on the input. Listbox
  // gets its own id so the combobox can reference it via
  // aria-controls + aria-activedescendant.
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const optionId = (idx: number) => `${inputId}-option-${idx}`;

  // Reset highlight to the first row whenever the result set changes
  // — without this, after a query narrows the list to fewer rows,
  // the old index could point past the new last item.
  const itemsKey = useMemo(
    () => companySearch.items.map(c => c.id).join("|"),
    [companySearch.items]
  );
  useEffect(() => {
    setHighlightedIndex(0);
  }, [itemsKey]);

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

  function pick(company: PublicCompany): void {
    onSelectedChange(company);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(0);
  }

  function onInputKeyDown(ev: ReactKeyboardEvent<HTMLInputElement>): void {
    if (ev.key === "Escape") {
      if (open) {
        ev.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex(idx =>
        Math.min(idx + 1, Math.max(0, companySearch.items.length - 1))
      );
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex(idx => Math.max(0, idx - 1));
      return;
    }
    if (ev.key === "Enter") {
      if (!open || companySearch.items.length === 0) return;
      ev.preventDefault();
      const target = companySearch.items[highlightedIndex];
      if (target) pick(target);
      return;
    }
    if (ev.key === "Home") {
      if (!open) return;
      ev.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (ev.key === "End") {
      if (!open || companySearch.items.length === 0) return;
      ev.preventDefault();
      setHighlightedIndex(companySearch.items.length - 1);
      return;
    }
  }

  if (selected) {
    // Chip branch — no input is rendered, so the label is rendered as
    // a plain <span> (no htmlFor) to avoid a dangling ARIA reference.
    return (
      <div className={`space-y-1 ${className}`}>
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
          {required ? " *" : ""}
        </span>
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

  const activeDescendantId =
    open && companySearch.items.length > 0
      ? optionId(highlightedIndex)
      : undefined;

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
        role="combobox"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendantId}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      {open ? (
        <ul
          id={listboxId}
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
            companySearch.items.map((c, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <li
                  key={c.id}
                  id={optionId(idx)}
                  role="option"
                  aria-selected={isHighlighted}
                  // ONLY onMouseDown — fires before the input's onBlur,
                  // so the selection lands before any blur-driven close.
                  // preventDefault() also suppresses the synthesized
                  // click event that would otherwise call pick() a
                  // second time (Sprint 6.7 audit fix C1).
                  // Keyboard activation goes through onInputKeyDown's
                  // Enter handler, not the <li>.
                  onMouseDown={ev => {
                    ev.preventDefault();
                    pick(c);
                  }}
                  // onMouseEnter keeps the highlight in sync with the
                  // pointer so a user that switches between keyboard
                  // and mouse doesn't see the highlight desync.
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`cursor-pointer px-3 py-2 ${
                    isHighlighted ? "bg-blue-100" : "hover:bg-blue-50"
                  }`}
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
