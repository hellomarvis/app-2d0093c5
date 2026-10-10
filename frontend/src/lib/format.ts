import { DEFAULT_TIME_ZONE, formatDateOnly, formatInZone } from './datetime';

// Display formatting for contract field values. Generated list/detail pages
// call formatValue(value, kind) so dates, booleans, and numbers render
// consistently everywhere without per-page formatting code.

export type FieldKind =
  | 'string'
  | 'text'
  | 'int'
  | 'float'
  | 'boolean'
  | 'datetime'
  | 'date'
  | 'json';

export function formatValue(value: unknown, kind: FieldKind, timeZone?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    return value.length === 0 ? '—' : value.map((item) => formatValue(item, kind, timeZone)).join(', ');
  }
  switch (kind) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    // A plain calendar day. Pinned to UTC — reading it in the viewer's zone is
    // what turns "Sept 20" into "Sept 19" for everyone west of the server.
    case 'date':
      return formatDateOnly(String(value));
    // A moment in time. Rendered in the zone it was SAVED for when the caller
    // passes one, so a 6 PM Karachi schedule reads 6 PM to every viewer. Falls
    // back to the viewer's own zone only when the record carries no zone.
    case 'datetime':
      return timeZone
        ? formatInZone(String(value), timeZone)
        : formatInZone(String(value), DEFAULT_TIME_ZONE);
    case 'float':
      return typeof value === 'number'
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : String(value);
    case 'int':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    case 'json':
      return JSON.stringify(value);
    default:
      return String(value);
  }
}
