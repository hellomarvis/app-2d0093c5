import * as React from 'react';

/**
 * SourceMarker — the approved design's "↗ Source …" trace-link button.
 * Clicking it scrolls the cited source element into view and flashes a
 * highlight on it, carrying across the design's signature "AI insight is
 * traceable to its source" interaction (see `trace` keyframe + `.focus-source`
 * in design-kit/user-approved-landing.html and the matching `.nexus-source-focus`
 * utility in tailwind.css).
 */
export function SourceMarker({ targetId, label }: { targetId: string; label: string }): React.ReactElement {
  const [justTraced, setJustTraced] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);

  const handleClick = (): void => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('nexus-source-focus');
    setJustTraced(true);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      el.classList.remove('nexus-source-focus');
      setJustTraced(false);
    }, 2000);
  };

  React.useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/10 px-2.5 py-1 font-mono text-[11px] text-secondary transition hover:bg-secondary/20"
    >
      <span aria-hidden style={justTraced ? { animation: 'trace .75s ease both', display: 'inline-block' } : undefined}>
        ↗
      </span>
      {label}
    </button>
  );
}
