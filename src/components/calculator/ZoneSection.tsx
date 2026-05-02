import type { KeyboardEvent } from "react";
import type { ZoneSectionProps } from "./types.js";

export function ZoneSection({
  id,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  navigation,
  panelClassName = "mb-6",
  headerClassName = "p-5 md:p-7",
  contentClassName = "p-5 md:p-7"
}: ZoneSectionProps) {
  const regionId = `${id}-content`;
  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <section id={id} className={["panel overflow-hidden", panelClassName].join(" ")}>
      <div
        className={[
          "w-full cursor-pointer select-none text-left transition hover:bg-slate-50/70",
          headerClassName
        ].join(" ")}
        onClick={onToggle}
        onKeyDown={handleHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="zone-title">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          <div className="inline-flex shrink-0 items-center text-lg leading-none text-slate-500">
            <span>{expanded ? "▾" : "▸"}</span>
          </div>
        </div>
      </div>
      {expanded ? (
        <div id={regionId} className={contentClassName}>
          {children}
          {navigation ? (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => navigation.onNavigate(navigation.start.id)}
                aria-label={`Back to start from ${title}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
              >
                Back to start
              </button>
              <button
                type="button"
                onClick={() => navigation.onNavigate(navigation.previous.id)}
                aria-label={`Back to previous zone from ${title}: ${navigation.previous.title}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 transition hover:border-blue-400 hover:bg-blue-100 sm:w-auto"
              >
                Back to previous zone
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
