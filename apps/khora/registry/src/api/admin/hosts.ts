import type { ConsoleAuth } from "@khoralabs/khora-console";
import { getRegistryDatabase, reloadRegistryAuth } from "@khoralabs/registry-auth";
import {
  activateKhoraHost,
  approveHostTrustedOriginQuotaRequest,
  approveHostTrustedOriginRequest,
  deleteKhoraHost,
  findHostById,
  InvalidTrustedOriginError,
  listHostTrustedOriginQuotaRequests,
  listHostTrustedOriginRequests,
  OriginQuotaExceededError,
  reactivateKhoraHost,
  rejectHostTrustedOriginQuotaRequest,
  rejectHostTrustedOriginRequest,
  suspendKhoraHost,
  TrustedOriginConflictError,
  updateHostRegistrySettings,
} from "@khoralabs/registry-catalog";
import { probeHostHealthById } from "../../host-health";
import { readRegistryTrustedOrigins } from "../../trusted-origins";
import { hostToFullJson } from "../host-json";
import { withConsoleAuth } from "./console-guard";

type HostRegistryBody = {
  registryParticipationEnabled?: boolean;
  includedTrustedOrigins?: number;
};

function reloadAuthTrustedOrigins(): void {
  reloadRegistryAuth({
    resolveTrustedOrigins: () => readRegistryTrustedOrigins(getRegistryDatabase()),
  });
}

function mapHostLifecycleError(
  err: unknown,
  fallback: string,
): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : fallback;
  const status = msg.includes("not found") ? 404 : 400;
  return { message: msg, status };
}

export function handleAdminHostSuspend(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    try {
      const host = suspendKhoraHost(db, id);
      reloadAuthTrustedOrigins();
      return Response.json({ host: hostToFullJson(host, db) });
    } catch (err: unknown) {
      const mapped = mapHostLifecycleError(err, "suspend failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminHostReactivate(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    try {
      const host = reactivateKhoraHost(db, id);
      reloadAuthTrustedOrigins();
      return Response.json({ host: hostToFullJson(host, db) });
    } catch (err: unknown) {
      const mapped = mapHostLifecycleError(err, "reactivate failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminHostDelete(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    try {
      const deleted = deleteKhoraHost(db, id);
      reloadAuthTrustedOrigins();
      return Response.json({ ok: true, slug: deleted.slug, baseUrl: deleted.baseUrl });
    } catch (err: unknown) {
      const mapped = mapHostLifecycleError(err, "delete failed");
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminHostActivate(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, async () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    try {
      const { host, managementToken } = activateKhoraHost(db, id, {
        satisfyOperatorApproval: true,
      });
      const probed = await probeHostHealthById(db, host.id);
      return Response.json({
        host: hostToFullJson(probed ?? host, db),
        ...(managementToken !== null ? { managementToken } : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "activate failed";
      const status = msg.includes("not found") ? 404 : 400;
      return Response.json({ error: msg }, { status });
    }
  });
}

export function handleAdminHostRegistry(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, async () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }

    let body: HostRegistryBody;
    try {
      body = (await req.json()) as HostRegistryBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (
      body.registryParticipationEnabled === undefined &&
      body.includedTrustedOrigins === undefined
    ) {
      return Response.json(
        { error: "registryParticipationEnabled or includedTrustedOrigins required" },
        { status: 400 },
      );
    }

    const db = getRegistryDatabase();
    try {
      const host = updateHostRegistrySettings(db, id, {
        ...(body.registryParticipationEnabled !== undefined
          ? { registryParticipationEnabled: body.registryParticipationEnabled }
          : {}),
        ...(body.includedTrustedOrigins !== undefined
          ? { includedTrustedOrigins: body.includedTrustedOrigins }
          : {}),
      });
      reloadAuthTrustedOrigins();
      return Response.json({ host: hostToFullJson(host, db) });
    } catch (err: unknown) {
      if (
        err instanceof InvalidTrustedOriginError ||
        err instanceof OriginQuotaExceededError ||
        err instanceof TrustedOriginConflictError
      ) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      const msg = err instanceof Error ? err.message : "registry update failed";
      const httpStatus = msg.includes("not found") ? 404 : 400;
      return Response.json({ error: msg }, { status: httpStatus });
    }
  });
}

export function handleAdminHostOriginRequests(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    if (findHostById(db, id) === null) {
      return Response.json({ error: "host not found" }, { status: 404 });
    }
    const pending = listHostTrustedOriginRequests(db, id, "pending");
    const rejected = listHostTrustedOriginRequests(db, id, "rejected").slice(0, 20);
    return Response.json({ pending, rejected });
  });
}

function mapOriginApprovalError(err: unknown): { message: string; status: number } {
  if (
    err instanceof InvalidTrustedOriginError ||
    err instanceof OriginQuotaExceededError ||
    err instanceof TrustedOriginConflictError
  ) {
    return { message: err.message, status: 400 };
  }
  const msg = err instanceof Error ? err.message : "origin request update failed";
  const status = msg.includes("not found") ? 404 : 400;
  return { message: msg, status };
}

export function handleAdminHostOriginRequestApprove(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
  requestId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    const rid = requestId.trim();
    if (id.length === 0 || rid.length === 0) {
      return Response.json({ error: "host id and request id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    const request = listHostTrustedOriginRequests(db, id).find((item) => item.id === rid);
    if (request === undefined || request.hostId !== id) {
      return Response.json({ error: "origin request not found" }, { status: 404 });
    }
    try {
      const { host } = approveHostTrustedOriginRequest(db, rid);
      reloadAuthTrustedOrigins();
      return Response.json({ host: hostToFullJson(host, db) });
    } catch (err: unknown) {
      const mapped = mapOriginApprovalError(err);
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminHostOriginRequestReject(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
  requestId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    const rid = requestId.trim();
    if (id.length === 0 || rid.length === 0) {
      return Response.json({ error: "host id and request id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    const request = listHostTrustedOriginRequests(db, id).find((item) => item.id === rid);
    if (request === undefined || request.hostId !== id) {
      return Response.json({ error: "origin request not found" }, { status: 404 });
    }
    try {
      rejectHostTrustedOriginRequest(db, rid);
      return Response.json({ ok: true });
    } catch (err: unknown) {
      const mapped = mapOriginApprovalError(err);
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminHostQuotaRequests(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    if (findHostById(db, id) === null) {
      return Response.json({ error: "host not found" }, { status: 404 });
    }
    const pending = listHostTrustedOriginQuotaRequests(db, id, "pending");
    const rejected = listHostTrustedOriginQuotaRequests(db, id, "rejected").slice(0, 20);
    return Response.json({ pending, rejected });
  });
}

function mapQuotaApprovalError(err: unknown): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : "quota request update failed";
  const status = msg.includes("not found") ? 404 : 400;
  return { message: msg, status };
}

export function handleAdminHostQuotaRequestApprove(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
  requestId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    const rid = requestId.trim();
    if (id.length === 0 || rid.length === 0) {
      return Response.json({ error: "host id and request id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    const request = listHostTrustedOriginQuotaRequests(db, id).find((item) => item.id === rid);
    if (request === undefined || request.hostId !== id) {
      return Response.json({ error: "quota request not found" }, { status: 404 });
    }
    try {
      const { host } = approveHostTrustedOriginQuotaRequest(db, rid);
      return Response.json({ host: hostToFullJson(host, db) });
    } catch (err: unknown) {
      const mapped = mapQuotaApprovalError(err);
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}

export function handleAdminHostQuotaRequestReject(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
  requestId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () => {
    const id = hostId.trim();
    const rid = requestId.trim();
    if (id.length === 0 || rid.length === 0) {
      return Response.json({ error: "host id and request id required" }, { status: 400 });
    }
    const db = getRegistryDatabase();
    const request = listHostTrustedOriginQuotaRequests(db, id).find((item) => item.id === rid);
    if (request === undefined || request.hostId !== id) {
      return Response.json({ error: "quota request not found" }, { status: 404 });
    }
    try {
      rejectHostTrustedOriginQuotaRequest(db, rid);
      return Response.json({ ok: true });
    } catch (err: unknown) {
      const mapped = mapQuotaApprovalError(err);
      return Response.json({ error: mapped.message }, { status: mapped.status });
    }
  });
}
