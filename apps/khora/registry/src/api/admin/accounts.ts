import type { ConsoleAuth } from "@khoralabs/khora-console";
import {
  deleteAccount,
  listAccountEmails,
  normalizeEmail,
  reactivateAccount,
  reactivateAccountByEmail,
  suspendAccount,
} from "@khoralabs/registry-accounts";
import { getRegistryDatabase } from "@khoralabs/registry-auth";
import { withConsoleAuth } from "./console-guard";

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
  consoleAuth: ConsoleAuth | null,
  accountId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = accountId.trim();
    if (id.length === 0) {
      return Response.json({ error: "account id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    try {
      const account = suspendAccount(db, id);
      const blockedEmailsCount = listAccountEmails(db, account.id).length;
      return Response.json({ account, blockedEmailsCount });
    } catch (err: unknown) {
      const mapped = mapAccountLifecycleError(err, "suspend failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminAccountDelete(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  accountId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = accountId.trim();
    if (id.length === 0) {
      return Response.json({ error: "account id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    try {
      const deleted = deleteAccount(db, id);
      return Response.json({ ok: true, ...deleted });
    } catch (err: unknown) {
      const mapped = mapAccountLifecycleError(err, "delete failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminAccountReactivate(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  accountId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = accountId.trim();
    if (id.length === 0) {
      return Response.json({ error: "account id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    try {
      const account = reactivateAccount(db, id);
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
  consoleAuth: ConsoleAuth | null,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, async () => {
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
    const db = getRegistryDatabase();
    const normalized = normalizeEmail(email);
    const authUser = db.prepare(`SELECT id FROM user WHERE email = ? LIMIT 1`).get(normalized) as {
      id: string;
    } | null;
    if (authUser === null) {
      return Response.json({ error: "auth user not found for email" }, { status: 404 });
    }
    try {
      const account = reactivateAccountByEmail(db, {
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
