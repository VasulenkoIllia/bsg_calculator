/**
 * Inline status banner used by CalculatorPage edit-mode (`/calc/:id`)
 * for loading / load-error states. Sprint 6.F.2 extracted from
 * CalculatorPage.tsx where it was a private subcomponent — splitting
 * out so the page file stays under 500 LOC and the component is
 * individually testable.
 *
 * Two tones (info / error) sized to fit above the calculator zones
 * without dominating the page.
 */

export function BannerStatus({
  tone,
  text
}: {
  tone: "info" | "error";
  text: string;
}) {
  const cls =
    tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-red-200 bg-red-50 text-red-800";
  return (
    <div role="status" className={`mb-3 rounded-lg border px-4 py-2 text-sm ${cls}`}>
      {text}
    </div>
  );
}
