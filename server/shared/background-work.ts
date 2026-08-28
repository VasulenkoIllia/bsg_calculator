/**
 * A registry of detached ("fire-and-forget") background work.
 *
 * Three code paths deliberately do not await their side effects — the
 * document and calculator-config auto-sync hooks, and the TTL row
 * refresh. That is correct in production: the operator must get their
 * 201 without waiting on a CRM round-trip.
 *
 * In the test suite it is a correctness problem. Work scheduled by one
 * test lands mid-way through the next one, after its TRUNCATE, which
 * produced an intermittent failure in a different, unrelated test on
 * roughly one run in five — always a test seeing (or missing) rows it
 * never touched. The previous mitigation drained a fixed number of
 * event-loop ticks and hoped that was enough; a chain of awaits spanning
 * a DB round-trip is not bounded by any tick count, so it was never
 * reliable.
 *
 * `track()` changes nothing about how the work runs: it is still
 * detached, still non-blocking, and its result is still ignored. The
 * only addition is that a promise which is guaranteed to settle is kept
 * in a set until it does, so a test can await ALL of it instead of
 * guessing.
 */

const pending = new Set<Promise<unknown>>();

/**
 * Register a detached promise. Returns nothing — callers must NOT await
 * it, or the fire-and-forget contract is lost.
 *
 * The promise handed to the set is pre-caught: a rejection here has
 * already been handled at the call site, and an unhandled rejection in
 * the registry would take the process down.
 */
export function track(work: Promise<unknown>): void {
  const settled = work.catch(() => undefined);
  pending.add(settled);
  void settled.finally(() => {
    pending.delete(settled);
  });
}

/**
 * Await everything currently in flight, including work scheduled BY that
 * work, until the registry is empty. Test-only; nothing in the request
 * path calls it.
 *
 * The loop matters: an auto-sync can schedule a follow-up, so a single
 * `Promise.all` over one snapshot would return with new work pending.
 */
export async function settleBackgroundWork(maxRounds = 50): Promise<void> {
  for (let round = 0; round < maxRounds && pending.size > 0; round++) {
    await Promise.all([...pending]);
  }
}

/** How much is in flight — for a diagnostic when a drain does not finish. */
export function pendingBackgroundWorkCount(): number {
  return pending.size;
}
