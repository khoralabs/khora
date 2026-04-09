import { LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS } from "./static";

/**
 * Full base system message: {@link LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS} plus the ontology section.
 */
export function buildLibrarianBaseSystemContent(): string {
  const now = new Date().toLocaleString();
  return `${LIBRARIAN_STATIC_SYSTEM_INSTRUCTIONS}\n\nToday's date and time: ${now}`.trim();
}
