import type { ConsoleAuth } from "@khoralabs/khora-console";
import {
  activateKhoraHost,
  InvalidClientOriginError,
  updateHostCorsSettings,
} from "@khoralabs/users";
import { getRegistryDatabase, reloadRegistryAuth } from "@khoralabs/users-auth";
import { probeHostHealthById } from "../../host-health";
import { readRegistryTrustedOrigins } from "../../trusted-origins";
import { hostToFullJson } from "../host-json";
import { withConsoleAuth } from "./console-guard";

type HostCorsBody = {
  corsTrusted?: boolean;
  clientOrigin?: string | null;
};

function reloadAuthTrustedOrigins(): void {
  reloadRegistryAuth({
    trustedOrigins: readRegistryTrustedOrigins(getRegistryDatabase()),
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
      const host = activateKhoraHost(db, id);
      const probed = await probeHostHealthById(db, host.id);
      return Response.json({ host: hostToFullJson(probed ?? host) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "activate failed";
      const status = msg.includes("not found") ? 404 : 400;
      return Response.json({ error: msg }, { status });
    }
  });
}

export function handleAdminHostCors(
  req: Request,
  consoleAuth: ConsoleAuth | null,
  hostId: string,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, async () => {
    const id = hostId.trim();
    if (id.length === 0) {
      return Response.json({ error: "host id required" }, { status: 400 });
    }

    let body: HostCorsBody;
    try {
      body = (await req.json()) as HostCorsBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.corsTrusted === undefined && body.clientOrigin === undefined) {
      return Response.json({ error: "corsTrusted or clientOrigin required" }, { status: 400 });
    }

    const db = getRegistryDatabase();
    try {
      const host = updateHostCorsSettings(db, id, {
        ...(body.corsTrusted !== undefined ? { corsTrusted: body.corsTrusted } : {}),
        ...(body.clientOrigin !== undefined ? { clientOrigin: body.clientOrigin } : {}),
      });
      reloadAuthTrustedOrigins();
      return Response.json({ host: hostToFullJson(host) });
    } catch (err: unknown) {
      if (err instanceof InvalidClientOriginError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      const msg = err instanceof Error ? err.message : "cors update failed";
      const status = msg.includes("not found") ? 404 : 400;
      return Response.json({ error: msg }, { status });
    }
  });
}
