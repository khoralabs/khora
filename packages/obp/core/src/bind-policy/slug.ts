/** Sluggify `name` for JSON keys (Bloom-style). Empty-safe. */
export function bindPolicySlug(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return s.length > 0 ? s : "field";
}

/** Assign unique slugs for each field index (duplicate names get `_1`, `_2`, …). */
export function bindPolicySlugKeys(fields: readonly { name: string }[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const f of fields) {
    let slug = bindPolicySlug(f.name);
    let n = 0;
    while (used.has(slug)) {
      n += 1;
      slug = `${bindPolicySlug(f.name)}_${n}`;
    }
    used.add(slug);
    out.push(slug);
  }
  return out;
}
