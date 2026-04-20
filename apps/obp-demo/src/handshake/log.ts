/** Short id for console (first 8 chars). */
export function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

export function logStep(title: string, detail?: Record<string, unknown>): void {
  if (detail === undefined) {
    console.log(`\n── ${title} ──`);
  } else {
    console.log(`\n── ${title} ──`, JSON.stringify(detail));
  }
}
