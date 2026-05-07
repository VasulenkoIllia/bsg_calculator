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
}
