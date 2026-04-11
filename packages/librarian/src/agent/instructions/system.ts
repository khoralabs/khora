import { LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS } from "./static";

/**
 * Base system message after the merge-plan block: {@link LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS} plus local time.
 */
export function buildLibrarianBaseSystemContent(): string {
  const now = new Date().toLocaleString();
  return `${LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS}\n\nToday's date and time: ${now}`.trim();
}
