// Timezone-correct handling for date and time fields.
//
// `<input type="datetime-local">` yields a WALL-CLOCK string ("2026-09-20T18:00")
// with no zone attached. Sending that straight to the API makes the stored moment
// depend on whichever machine parsed it — servers run UTC, so "6 PM Karachi"
// silently became 6 PM UTC and came back as 11 PM. Every function here converts
// against an EXPLICIT IANA zone, never the browser's and never the server's.
//
// Two kinds of field, two different rules:
//   datetime — a moment in time. Converted using the zone the user picked.
//   date     — a plain calendar day (a birthday, a deadline). NEVER converted:
//              "Sept 20" is Sept 20 everywhere, and running it through a zone
//              slides it to Sept 19 for every viewer west of the server.

// `Intl.supportedValuesOf` exists in every runtime this app targets (Node 18+,
// all current browsers) but is only TYPED from lib ES2022, and the app compiles
// against ES2020. Declaring it here keeps the build green without widening the
// app's tsconfig, which is part of the deploy contract.
type IntlWithZones = typeof Intl & {
  supportedValuesOf?: (key: 'timeZone') => string[];
};

/** A short fallback for the rare runtime that lacks the enumeration API — the
 *  conversion functions below work with ANY zone, this only seeds the picker. */
const FALLBACK_ZONES = [
  'UTC', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Berlin', 'Europe/Istanbul', 'Africa/Cairo', 'Africa/Lagos',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
];

/** Every zone the runtime knows (~418), for populating a timezone picker. */
export const TIME_ZONES: string[] =
  (Intl as IntlWithZones).supportedValuesOf?.('timeZone') ?? FALLBACK_ZONES;

/** The viewer's own zone — only a sensible DEFAULT for the picker, never an
 *  assumption applied to a value that already carries its own zone. */
export const DEFAULT_TIME_ZONE: string =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * The fields `partsIn` always hands back.
 *
 * NAMED rather than the `Record<string, string>` it is built from: this app
 * compiles with `noPropertyAccessFromIndexSignature` and
 * `noUncheckedIndexedAccess`, under which `p.year` on an index signature is
 * both a wrong-syntax error and a `string | undefined`. Resolving the shape
 * once, here, keeps every call site reading as plain properties.
 */
interface WallParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

const partsIn = (instant: Date, zone: string, withSeconds: boolean): WallParts => {
  const parts: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
  });
  for (const { type, value } of fmt.formatToParts(instant)) parts[type] = value;
  // Some engines report midnight as hour "24"; normalise before arithmetic.
  if (parts['hour'] === '24') parts['hour'] = '00';
  // The defaults are unreachable for every field the formatter was asked for —
  // they exist so the shape is total. `second` is the one genuinely absent
  // half the time (withSeconds === false), and its only caller passes true.
  return {
    year: parts['year'] ?? '1970',
    month: parts['month'] ?? '01',
    day: parts['day'] ?? '01',
    hour: parts['hour'] ?? '00',
    minute: parts['minute'] ?? '00',
    second: parts['second'] ?? '00',
  };
};

/** Offset of `zone` from UTC, in minutes, at one absolute instant. */
function offsetMinutes(instant: Date, zone: string): number {
  const p = partsIn(instant, zone, true);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUtc - instant.getTime()) / 60000;
}

/** Wall-clock text + zone -> the absolute instant it refers to. */
function toInstant(wallClock: string, zone: string): Date {
  // Every destructured element is defaulted: under `noUncheckedIndexedAccess`
  // an array element is `T | undefined`, and `Date.UTC(undefined, …)` is a type
  // error before it is a NaN. The defaults are only reached for malformed input
  // — a well-formed "YYYY-MM-DDTHH:mm" fills all five.
  const [datePart = '', timePart = '00:00'] = wallClock.split('T');
  const [y = 0, mo = 1, d = 1] = datePart.split('-').map(Number);
  const [h = 0, mi = 0] = timePart.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes: near a DST boundary the offset at the guessed instant differs
  // from the offset at the corrected one, and the corrected one is the answer.
  const first = offsetMinutes(new Date(guess), zone);
  const candidate = new Date(guess - first * 60000);
  const second = offsetMinutes(candidate, zone);
  return second === first ? candidate : new Date(guess - second * 60000);
}

/**
 * "2026-09-20T18:00" + "Asia/Karachi" -> "2026-09-20T13:00:00.000Z".
 * Send this to the API. The API's `z.coerce.date()` accepts it unambiguously.
 */
export function zonedToIso(wallClock: string | undefined | null, zone: string): string | undefined {
  if (!wallClock) return undefined;
  return toInstant(wallClock, zone).toISOString();
}

/** Stored instant -> wall-clock text for pre-filling the form in `zone`. */
export function isoToZonedWallClock(iso: string | Date | undefined | null, zone: string): string {
  if (!iso) return '';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  const p = partsIn(instant, zone, false);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Clocks jumping forward delete local times: in New York on 8 Mar 2026 the clock
 * goes 01:59 -> 03:00, so 02:30 never happens. The jump is not always an hour
 * (Lord Howe Island moves 30 minutes, Troll Station 2 hours), so rather than
 * assume a size we convert, convert back, and see whether we got what we were
 * given. Returns the nearest real time to suggest, or null when the input is fine.
 */
export function nonexistentLocalTime(wallClock: string, zone: string): string | null {
  if (!wallClock) return null;
  const roundTrip = isoToZonedWallClock(toInstant(wallClock, zone), zone);
  return roundTrip === wallClock ? null : roundTrip;
}

/** A plain calendar day -> midnight UTC, so it can never drift across a date line. */
export function dateOnlyToIso(day: string | undefined | null): string | undefined {
  if (!day) return undefined;
  return `${day}T00:00:00.000Z`;
}

/** Stored calendar day -> "YYYY-MM-DD" for `<input type="date">`. Read back in
 *  UTC because that is how `dateOnlyToIso` wrote it. */
export function isoToDateOnly(iso: string | Date | undefined | null): string {
  if (!iso) return '';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  return instant.toISOString().slice(0, 10);
}

/**
 * Render a stored instant in the zone it was scheduled for — NOT the viewer's.
 * A post set for 6 PM Karachi reads "6:00 PM GMT+5" to everyone, which is what
 * a schedule means. `timeZoneName` cannot be combined with dateStyle/timeStyle,
 * so the components are spelled out.
 */
export function formatInZone(
  iso: string | Date | undefined | null,
  zone: string,
  locale?: string,
): string {
  if (!iso) return '—';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '—';
  return instant.toLocaleString(locale, {
    timeZone: zone || 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Render a plain calendar day. Pinned to UTC so it shows the same day everywhere. */
export function formatDateOnly(iso: string | Date | undefined | null, locale?: string): string {
  if (!iso) return '—';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '—';
  return instant.toLocaleDateString(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
