import type { ConsoleAuth } from "@khoralabs/khora-console";
import {
  activateKhoraHost,
  InvalidTrustedOriginError,
  OriginQuotaExceededError,
  TrustedOriginConflictError,
  updateHostRegistrySettings,
} from "@khoralabs/users";
import { getRegistryDatabase, reloadRegistryAuth } from "@khoralabs/users-auth";
import { probeHostHealthById } from "../../host-health";
import { readRegistryTrustedOrigins } from "../../trusted-origins";
import { hostToFullJson } from "../host-json";
import { withConsoleAuth } from "./console-guard";

type HostRegistryBody = {
  registryParticipationEnabled?: boolean;
  origins?: string[];
  includedTrustedOrigins?: number;
};

function reloadAuthTrustedOrigins(): void {
  reloadRegistryAuth({
    resolveTrustedOrigins: () => readRegistryTrustedOrigins(getRegistryDatabase()),
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
      const { host, managementToken } = activateKhoraHost(db, id);
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
      body.origins === undefined &&
      body.includedTrustedOrigins === undefined
    ) {
      return Response.json(
        { error: "registryParticipationEnabled, origins, or includedTrustedOrigins required" },
        { status: 400 },
      );
    }

    const db = getRegistryDatabase();
    try {
      const host = updateHostRegistrySettings(db, id, {
        ...(body.registryParticipationEnabled !== undefined
          ? { registryParticipationEnabled: body.registryParticipationEnabled }
          : {}),
        ...(body.origins !== undefined ? { origins: body.origins } : {}),
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
      const status = msg.includes("not found") ? 404 : 400;
      return Response.json({ error: msg }, { status });
    }
  });
}
