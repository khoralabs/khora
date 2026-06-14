/** Bind a JSON value for SQLite JSONB columns (`jsonb(?)`). */
export function jsonbParam(value: unknown): string {
  return JSON.stringify(value);
}

/** Parse a column returned via `json(col)` (or raw text JSON). */
export function parseJsonColumn<T>(raw: string | null | undefined): T | undefined {
  if (raw === null || raw === undefined || raw.length === 0) return undefined;
  return JSON.parse(raw) as T;
}
