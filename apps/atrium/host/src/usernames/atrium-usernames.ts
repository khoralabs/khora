import type { Database } from "bun:sqlite";
import { migrateAtriumHostDb } from "../persistence/sqlite/migrate-atrium-host-db.ts";

export type AtriumUsernameRow = { username: string; did: string; createdAtMs: number };

export type AtriumUsernameRenameResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "not_found" };

export type AtriumUsernamesRepo = {
  /** Atomically claim `username` for `did`. Returns false on collision (PK or UNIQUE did). */
  tryReserve(did: string, username: string): boolean;
  /**
   * Rename a DID's username transactionally. Inserts the new row first; on PK collision returns
   * `{ok:false, reason:"taken"}`. If `did` has no existing username, returns `{ok:false, reason:"not_found"}`.
   */
  rename(did: string, newUsername: string): AtriumUsernameRenameResult;
  /** Drop any username owned by `did`. Idempotent; used to roll back a failed registration. */
  release(did: string): void;
  /** Lookup the DID that owns `username`, or `undefined`. */
  lookupByUsername(username: string): { did: string } | undefined;
  /** Lookup the username owned by `did`, or `undefined`. */
  lookupByDid(did: string): { username: string } | undefined;
};

export function createAtriumUsernamesRepo(db: Database): AtriumUsernamesRepo {
  migrateAtriumHostDb(db);

  const insertUsername = db.prepare(
    `INSERT INTO atrium_usernames (username, did, created_at_ms) VALUES (?, ?, ?)`,
  );
  const deleteByDid = db.prepare(`DELETE FROM atrium_usernames WHERE did = ?`);
  const selectByUsername = db.query<{ did: string }, [string]>(
    `SELECT did FROM atrium_usernames WHERE username = ?`,
  );
  const selectByDid = db.query<{ username: string }, [string]>(
    `SELECT username FROM atrium_usernames WHERE did = ?`,
  );

  function isUniqueViolation(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes("UNIQUE");
  }

  return {
    tryReserve(did, username) {
      try {
        const r = insertUsername.run(username, did, Date.now());
        return r.changes === 1;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },

    rename(did, newUsername) {
      const current = selectByDid.get(did);
      if (current === null || current === undefined) return { ok: false, reason: "not_found" };
      if (current.username === newUsername) return { ok: true };
      // Delete old then insert new inside a transaction. If the new name is taken, the INSERT
      // throws and the transaction rolls back, restoring the old row.
      const tx = db.transaction(() => {
        deleteByDid.run(did);
        insertUsername.run(newUsername, did, Date.now());
      });
      try {
        tx();
        return { ok: true } as const;
      } catch (e) {
        if (isUniqueViolation(e)) return { ok: false, reason: "taken" } as const;
        throw e;
      }
    },

    release(did) {
      deleteByDid.run(did);
    },

    lookupByUsername(username) {
      const r = selectByUsername.get(username);
      return r === null || r === undefined ? undefined : { did: r.did };
    },

    lookupByDid(did) {
      const r = selectByDid.get(did);
      return r === null || r === undefined ? undefined : { username: r.username };
    },
  };
}
