// Wizard-layer document defaults + provider-cost floors (2026-05-31).
//
// These live ONLY in the document/wizard layer — the calculator domain
// (`src/domain/calculator/**`) stays frozen. The SAME constants drive
// the wizard input `min` props (NumberField hard-clamps to them via
// `clampNumber`) AND the manual-seed default values, so the UI floor and
// the seeded default can never drift apart.
//
// Floors are provider COSTS: a manager can only mark UP from them, never
// below ("менеджер сам накрутит маркап").

// Payin TRX provider-cost floors (€ per transaction). Applied to every
// payin construction — single / tiered / both regions / section 1.1.
export const PAYIN_TRX_CC_MIN = 0.22;
export const PAYIN_TRX_APM_MIN = 0.27;

// Step 4 fee provider-cost floors (€). Each doubles as the manual-seed
// default value (the field starts AT cost). NOTE: THREE_DS_FEE_MIN (cost
// 0.03) intentionally differs from the calculator's 3DS *revenue* default
// (0.05) — the document starts at provider cost and the manager marks up.
export const REFUND_COST_MIN = 10;
export const DISPUTE_COST_MIN = 50;
export const THREE_DS_FEE_MIN = 0.03;

// Step 4 always-on fee defaults (no separate floor). Pinned here — same
// values as the calculator config today, but kept in the wizard layer so
// a future calculator-config change can't silently move the wizard default.
export const SETTLEMENT_FEE_RATE_DEFAULT = 0.3;
export const MONTHLY_MINIMUM_FEE_DEFAULT = 5000;

// Terms default: Rolling Reserve hold period (days).
export const ROLLING_RESERVE_HOLD_DAYS_DEFAULT = 180;
