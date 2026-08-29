import type { AdminTokenAuth } from "@khoralabs/admin-token";
import {
  deleteAccount,
  listAccountEmails,
  normalizeEmail,
  reactivateAccount,
  reactivateAccountByEmail,
  suspendAccount,
} from "@khoralabs/registry/accounts";
import { registryHostRuntime } from "../../runtime";
import { withAdminTokenAuth } from "./admin-token-guard";

function mapAccountLifecycleError(
  err: unknown,
  fallback: string,
): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : fallback;
  if (msg.includes("not found")) return { message: msg, status: 404 };
  if (msg.includes("blocked")) return { message: msg, status: 403 };
  if (msg.includes("required")) return { message: msg, status: 400 };
  return { message: msg, status: 400 };
}

export function handleAdminAccountSuspend(
  req: Request,
  adminTokenAuth: AdminTokenAuth | null,
  accountId: string,
): Promise<Response> {
  return withAdminTokenAuth(req, adminTokenAuth, async () => {
    const id = accountId.trim();
    if (id.length === 0) {
      return Response.json({ error: "account id required" }, { status: 400 });
    }
    const db = registryHostRuntime().db;
    try {
      const account = await suspendAccount(db, id);
      const blockedEmailsCount = (await listAccountEmails(db, account.id)).length;
      return Response.json({ account, blockedEmailsCount });
    } catch (err: unknown) {
      const mapped = mapAccountLifecycleError(err, "suspend failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminAccountDelete(
  req: Request,
  adminTokenAuth: AdminTokenAuth | null,
  accountId: string,
): Promise<Response> {
  return withAdminTokenAuth(req, adminTokenAuth, async () => {
    const id = accountId.trim();
    if (id.length === 0) {
      return Response.json({ error: "account id required" }, { status: 400 });
    }
    const db = registryHostRuntime().db;
    try {
      const deleted = await deleteAccount(db, id);
      return Response.json({ ok: true, ...deleted });
    } catch (err: unknown) {
      const mapped = mapAccountLifecycleError(err, "delete failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminAccountReactivate(
  req: Request,
  adminTokenAuth: AdminTokenAuth | null,
  accountId: string,
): Promise<Response> {
  return withAdminTokenAuth(req, adminTokenAuth, async () => {
    const id = accountId.trim();
    if (id.length === 0) {
      return Response.json({ error: "account id required" }, { status: 400 });
    }
    const db = registryHostRuntime().db;
    try {
      const account = await reactivateAccount(db, id);
      return Response.json({ account });
    } catch (err: unknown) {
      const mapped = mapAccountLifecycleError(err, "reactivate failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

type ReactivateByEmailBody = { email?: string };

export function handleAdminAccountReactivateByEmail(
  req: Request,
  adminTokenAuth: AdminTokenAuth | null,
): Promise<Response> {
  return withAdminTokenAuth(req, adminTokenAuth, async () => {
    let body: ReactivateByEmailBody;
    try {
      body = (await req.json()) as ReactivateByEmailBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const email = body.email?.trim();
    if (!email) {
      return Response.json({ error: "email required" }, { status: 400 });
    }
    const db = registryHostRuntime().db;
    const normalized = normalizeEmail(email);
    const authUser = await db.queryOne<{ id: string }>(
      `SELECT id FROM user WHERE email = ? LIMIT 1`,
      [normalized],
    );
    if (authUser === undefined) {
      return Response.json({ error: "auth user not found for email" }, { status: 404 });
    }
    try {
      const account = await reactivateAccountByEmail(db, {
        email: normalized,
        providerSubject: authUser.id,
      });
      return Response.json({ account });
    } catch (err: unknown) {
      const mapped = mapAccountLifecycleError(err, "reactivate by email failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}
