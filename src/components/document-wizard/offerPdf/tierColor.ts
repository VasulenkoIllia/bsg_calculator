// Maps a 0-based tier index to its CSS colour class. Used by the
// payin (Card Acquiring) and payout (Pay Out) tiered renderers so all
// tier-coloured cells in a row share the same shade.
//
//   tier 0 → tier-color-1 (#2358EA, blue)
//   tier 1 → tier-color-2 (#3F38E3, blue-purple)
//   tier 2+ → tier-color-3 (#7D2AEB, purple)
//
// The `tier-color-1` class is also the default colour for non-tiered
// (single-mode) primary values so single-mode and the first tier of a
// tiered table read in the same blue.
export function tierColorClass(index: number): string {
  if (index === 0) return "tier-color-1";
  if (index === 1) return "tier-color-2";
  return "tier-color-3";
}
