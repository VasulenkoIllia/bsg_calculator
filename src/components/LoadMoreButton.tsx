/**
 * Pagination tail button used by every cursor-paginated listing.
 *
 * Extracted in 2.8.F.5 from the two duplicate copies in CompaniesPage
 * and CompanyDetailPage. The next listing (Sprint 3 Calculator
 * Configs) should reuse this rather than copy/paste a third time.
 *
 * Renders NOTHING when `hasNextPage === false` — that lets call sites
 * unconditionally mount it without a wrapper guard.
 */

interface LoadMoreButtonProps {
  /** From TanStack Query's `useInfiniteQuery` result. */
  hasNextPage: boolean;
  /** From the same result; we toggle the button to a loading state. */
  isFetchingNextPage: boolean;
  /** Fires the next-page fetch. */
  fetchNextPage: () => void;
  /** Optional override — e.g. "Load more deals" instead of "Load more". */
  label?: string;
}

export function LoadMoreButton({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  label = "Load more"
}: LoadMoreButtonProps) {
  if (!hasNextPage) return null;

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={fetchNextPage}
        disabled={isFetchingNextPage}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isFetchingNextPage ? "Loading…" : label}
      </button>
    </div>
  );
}
