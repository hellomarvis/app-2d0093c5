import { cn } from '@/lib/utils';

/**
 * InitialsAvatar — deterministic, zero-asset avatar for person entities.
 * Every human rendered in the UI gets one (lists, cards, detail headers) —
 * a person as bare text reads unfinished. Hue derives from the name, so the
 * same person is always the same color.
 */
export function InitialsAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}): React.ReactElement {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join(('' as string)) || '?';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-20 w-20 text-2xl',
  } as const;
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white',
        sizes[size],
        className,
      )}
      style={{ background: `oklch(0.55 0.13 ${hue})` }}
    >
      {initials}
    </div>
  );
}
