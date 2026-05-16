/**
 * Tiny debounce hook — returns the input value `delayMs` after the
 * last change. Used to throttle search-as-you-type so the API isn't
 * hit on every keystroke.
 *
 * Deliberately not pulling in lodash for one function — the
 * dependency footprint would dwarf the implementation.
 */

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
