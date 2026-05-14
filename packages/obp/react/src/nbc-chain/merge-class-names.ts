/** Join class names; empty inputs yield `undefined`. */
export function mergeClassNames(...parts: (string | undefined | false)[]): string | undefined {
  const s = parts.filter(Boolean).join(" ").trim();
  return s === "" ? undefined : s;
}
