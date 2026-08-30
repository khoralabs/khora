import type { AdminTokenAuth } from "@khoralabs/khora-auth";
import {
  lookupRegistryByAccountId,
  lookupRegistryByEmail,
  normalizeEmail,
  type RegistryAuthUser,
  type RegistryEmailLookupResponse,
} from "@khoralabs/khora-registry/accounts";
import { registryHostRuntime } from "../../runtime";
import { withAdminTokenAuth } from "./admin-token-guard";

async function findAuthUserByEmail(email: string): Promise<RegistryAuthUser | null> {
  const db = registryHostRuntime().db;
  try {
    const row = await db.queryOne<RegistryAuthUser>(
      `SELECT id, email, role FROM user WHERE email = ? LIMIT 1`,
      [normalizeEmail(email)],
    );
    return row ?? null;
  } catch {
    return null;
  }
}

export async function lookupEmailResponse(email: string): Promise<Response> {
  const normalized = normalizeEmail(email);
  if (normalized.length === 0 || !normalized.includes("@")) {
    return Response.json({ error: "Missing or invalid email query parameter" }, { status: 400 });
  }
  const lookup = await lookupRegistryByEmail(registryHostRuntime().db, normalized);
  const authUser = await findAuthUserByEmail(normalized);
  const body: RegistryEmailLookupResponse = { ...lookup, authUser };
  return Response.json(body);
}

export async function lookupAccountResponse(accountId: string): Promise<Response> {
  const id = accountId.trim();
  if (id.length === 0) {
    return Response.json({ error: "Missing id query parameter" }, { status: 400 });
  }
  const lookup = await lookupRegistryByAccountId(registryHostRuntime().db, id);
  if (lookup === null) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }
  return Response.json(lookup);
}

export function handleLookupEmail(
  req: Request,
  url: URL,
  adminTokenAuth: AdminTokenAuth | null,
): Promise<Response> {
  const email = url.searchParams.get("email") ?? "";
  return withAdminTokenAuth(req, adminTokenAuth, () => lookupEmailResponse(email));
}

export function handleLookupAccount(
  req: Request,
  url: URL,
  adminTokenAuth: AdminTokenAuth | null,
): Promise<Response> {
  const id = url.searchParams.get("id") ?? "";
  return withAdminTokenAuth(req, adminTokenAuth, () => lookupAccountResponse(id));
}
