export interface PdfUiKitTokens {
  pageMarginCm: number;
  fontFamily: string;
  colorAccent: string;
  colorAccentSoft: string;
  colorAccentSurface: string;
  colorTextPrimary: string;
  colorTextMuted: string;
  colorTextLight: string;
  colorBorder: string;
  colorTableHeaderBg: string;
  colorTableHeaderText: string;
  colorTableAltRow: string;
  colorPaper: string;
  colorScreenBackground: string;
  shadowPaper: string;
  radiusS: string;
  radiusM: string;
}

export const OFFER_REFERENCE_TOKENS: PdfUiKitTokens = {
  pageMarginCm: 2.0,
  fontFamily: "Arial, Helvetica, sans-serif",
  colorAccent: "#4f46e5",
  colorAccentSoft: "#c8c7ff",
  colorAccentSurface: "#f1f2ff",
  colorTextPrimary: "#0f172a",
  colorTextMuted: "#6b7280",
  colorTextLight: "#9ca3af",
  colorBorder: "#d7dce8",
  colorTableHeaderBg: "#eef1f7",
  colorTableHeaderText: "#9aa3b5",
  colorTableAltRow: "#fafbff",
  colorPaper: "#ffffff",
  colorScreenBackground: "#f1f5fb",
  shadowPaper: "0 10px 30px rgba(15, 23, 42, 0.08)",
  radiusS: "3px",
  radiusM: "6px"
};

export function resolvePdfUiKitTokens(override?: Partial<PdfUiKitTokens>): PdfUiKitTokens {
  return {
    ...OFFER_REFERENCE_TOKENS,
    ...(override ?? {})
  };
}
