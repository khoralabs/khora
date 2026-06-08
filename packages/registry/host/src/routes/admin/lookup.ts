import type { ConsoleAuth } from "@khoralabs/khora-console";
import {
  lookupRegistryByAccountId,
  lookupRegistryByEmail,
  normalizeEmail,
  type RegistryAuthUser,
  type RegistryEmailLookupResponse,
} from "@khoralabs/registry-accounts";
import { registryHostRuntime } from "../../runtime";
import { withConsoleAuth } from "./console-guard";

function findAuthUserByEmail(email: string): RegistryAuthUser | null {
  const db = registryHostRuntime().db;
  try {
    const row = db
      .prepare(`SELECT id, email, role FROM user WHERE email = ? LIMIT 1`)
      .get(normalizeEmail(email)) as RegistryAuthUser | null;
    return row;
  } catch {
    return null;
  }
}

export function lookupEmailResponse(email: string): Response {
  const normalized = normalizeEmail(email);
  if (normalized.length === 0 || !normalized.includes("@")) {
    return Response.json({ error: "Missing or invalid email query parameter" }, { status: 400 });
  }
  const lookup = lookupRegistryByEmail(registryHostRuntime().db, normalized);
  const authUser = findAuthUserByEmail(normalized);
  const body: RegistryEmailLookupResponse = { ...lookup, authUser };
  return Response.json(body);
}

export function lookupAccountResponse(accountId: string): Response {
  const id = accountId.trim();
  if (id.length === 0) {
    return Response.json({ error: "Missing id query parameter" }, { status: 400 });
  }
  const lookup = lookupRegistryByAccountId(registryHostRuntime().db, id);
  if (lookup === null) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }
  return Response.json(lookup);
}

export function handleLookupEmail(
  req: Request,
  url: URL,
  consoleAuth: ConsoleAuth | null,
): Promise<Response> {
  const email = url.searchParams.get("email") ?? "";
  return withConsoleAuth(req, consoleAuth, () => lookupEmailResponse(email));
}

export function handleLookupAccount(
  req: Request,
  url: URL,
  consoleAuth: ConsoleAuth | null,
): Promise<Response> {
  const id = url.searchParams.get("id") ?? "";
  return withConsoleAuth(req, consoleAuth, () => lookupAccountResponse(id));
}
