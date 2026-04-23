/**
 * Demo / dev default until real account ids are wired. Override with
 * `SUBJECT_ID` or `MATCHMAKING_SUBJECT_ID` in `.env` (Bun loads it).
 */
const DEFAULT_SUBJECT_ID = "_user_";

/**
 * Subject key for co-keying memory namespaces, negotiator agent id segments, and
 * `invocationContext` (per plan: template vs per-user binding).
 */
export function resolveMatchmakingSubjectId(): string {
  const s = (process.env.SUBJECT_ID ?? process.env.MATCHMAKING_SUBJECT_ID)?.trim();
  return s && s.length > 0 ? s : DEFAULT_SUBJECT_ID;
}
