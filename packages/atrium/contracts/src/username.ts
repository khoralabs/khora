import z from "zod";

/**
 * Reserved usernames that may collide with current or future system routes / handles.
 * Kept tiny and explicit; expand here when new system identities are introduced.
 */
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "atrium",
  "me",
  "root",
  "system",
  "khora",
  "khoralabs",
  "vellum",
  "domus",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  // "g", G's username
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  // "z", Zach's username
]);

/**
 * GitHub-style canonical form: lowercase `a-z 0-9 -`, starts and ends with alphanumeric,
 * no consecutive dashes, total length 1-39.
 */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;

/** Lowercases + trims `raw`, then validates against the canonical username format. */
export function normalizeUsername(raw: string): string {
  if (typeof raw !== "string") {
    throw new Error("username must be a string");
  }
  const s = raw.trim().toLowerCase();
  if (s.length === 0) {
    throw new Error("username is empty");
  }
  if (!USERNAME_RE.test(s)) {
    throw new Error(
      "username must be 1-39 chars, a-z 0-9 -, starting and ending with alphanumeric, no consecutive dashes",
    );
  }
  if (RESERVED_USERNAMES.has(s)) {
    throw new Error(`username '${s}' is reserved`);
  }
  return s;
}

/** Zod schema accepting any-cased input and emitting the canonical lowercase username. */
export const zUsername = z.string().transform((s, ctx) => {
  try {
    return normalizeUsername(s);
  } catch (e) {
    ctx.addIssue({
      code: "custom",
      message: e instanceof Error ? e.message : String(e),
    });
    return z.NEVER;
  }
});

export type Username = z.infer<typeof zUsername>;
