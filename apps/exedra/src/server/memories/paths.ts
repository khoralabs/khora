import path from "node:path";
import { resolveMemoriesDir } from "./config.js";
import { encodePrincipalIdForMemories } from "./encode-principal-id.js";

export function resolveOrgMemoriesDbPath(orgId: string): string {
  return path.join(resolveMemoriesDir(), `${orgId}.db`);
}

export function resolveUserMemoriesDbPath(userId: string): string {
  const encoded = encodePrincipalIdForMemories(userId);
  return path.join(resolveMemoriesDir(), `${encoded}.db`);
}
