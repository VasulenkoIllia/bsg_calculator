// Renders a complete HTML document inside a hidden iframe and triggers the
// browser print dialog. Used to produce PDFs via "Save as PDF" without
// opening a popup window (which gets blocked or returns null when
// `noopener` is set on `window.open`).
//
// Implementation notes:
// - Uses a Blob URL instead of `srcdoc`. Safari prints `about:blank` when
//   `srcdoc` is used because its print machinery looks at `location.href`
//   instead of the rendered document.
// - Waits two animation frames after `load` so Safari has performed layout
//   before `print()` is invoked; calling print before layout produces a
//   blank page.
// - Awaits `document.fonts.ready` so web fonts (Inter / Google Fonts in
//   the offer template) are embedded in the captured PDF.
export function printHtmlViaIframe(html: string): boolean {
  if (typeof document === "undefined") return false;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Print preview");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    URL.revokeObjectURL(blobUrl);
    iframe.remove();
  };

  iframe.addEventListener("load", () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    // Two RAFs guarantee Safari has run layout for the iframe document
    // before we ask it to print. One RAF is sometimes too early.
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          await win.document.fonts?.ready;
        } catch {
          // Ignore — proceed with print regardless.
        }
        win.addEventListener("afterprint", cleanup, { once: true });
        // Fallback cleanup if `afterprint` never fires.
        setTimeout(cleanup, 60_000);
        win.focus();
        win.print();
      });
    });
  });

  document.body.appendChild(iframe);
  iframe.src = blobUrl;
  return true;
}
