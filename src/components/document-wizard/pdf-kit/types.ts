export interface MetaItem {
  label: string;
  value: string;
}

export interface FeeCardItem {
  title: string;
  value: string;
  // Optional secondary line. Cards that omit it (e.g. FAILED TRX
  // CHARGING after the "Calculator mode" hint was removed) render
  // without a subtitle paragraph.
  subtitle?: string;
}

export interface TermsGridItem {
  label: string;
  value: string;
  // Optional colour override for the value text. Used by user-added
  // custom Terms & Limitations rows (see CustomTermsItem). Built-in
  // rows leave it undefined so they keep the default text colour.
  valueColor?: "blue" | "black" | "orange";
}
