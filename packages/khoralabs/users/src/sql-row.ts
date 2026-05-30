/**
 * SQLite row shapes: snake_case column names derived from domain types in types.ts.
 */

type WordSeparators = "-" | "_";

/** camelCase / PascalCase key → snake_case column name */
export type SnakeCaseKey<S extends string> = S extends `${infer First}${infer Rest}`
  ? First extends Uppercase<First>
    ? `${First extends WordSeparators ? "" : "_"}${Lowercase<First>}${SnakeCaseKey<Rest>}`
    : `${First}${SnakeCaseKey<Rest>}`
  : S;

/** Default SQLite column type for a domain field */
export type SqlRowValue<T> = [T] extends [Record<string, unknown>]
  ? string | null
  : [T] extends [string]
    ? string
    : [T] extends [number]
      ? number
      : [T] extends [boolean]
        ? number
        : [T] extends [null]
          ? null
          : [T] extends [infer U | null]
            ? SqlRowValue<U> | null
            : never;

/** Row type returned by bun:sqlite for a domain entity */
export type SqlRow<
  T extends Record<string, unknown>,
  Overrides extends Partial<{ [K in keyof T]: unknown }> = {},
> = {
  [K in keyof T as SnakeCaseKey<K & string>]: K extends keyof Overrides
    ? Overrides[K]
    : SqlRowValue<T[K]>;
};

/** SELECT column list from a domain→column map */
export function sqlSelectColumns<const M extends Record<string, string>>(columns: M): string {
  return Object.values(columns).join(", ");
}
