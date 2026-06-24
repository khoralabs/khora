import { localDatabasePath } from "../storage/paths.js";
import { resolveMemoriesDir } from "./config.js";

export function resolveOrgMemoriesDbPath(orgId: string): string {
  return localDatabasePath({
    kind: "organization",
    did: orgId,
    memoriesDir: resolveMemoriesDir(),
  });
}

export function resolveUserMemoriesDbPath(userId: string): string {
  return localDatabasePath({
    kind: "account",
    did: userId,
    memoriesDir: resolveMemoriesDir(),
  });
}
