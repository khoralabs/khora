import type { ConsoleAuth } from "@khoralabs/khora-console";
import { activateKhoraHost } from "@khoralabs/users";
import { getRegistryDatabase } from "@khoralabs/users-auth";
import { probeHostHealthById } from "../../host-health";
import { hostToFullJson } from "../host-json";
import { withConsoleAuth } from "./console-guard";

export function handleAdminHostActivate(
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
      const host = activateKhoraHost(db, id);
      void probeHostHealthById(db, host.id);
      return Response.json({ host: hostToFullJson(host) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "activate failed";
      const status = msg.includes("not found") ? 404 : 400;
      return Response.json({ error: msg }, { status });
    }
  });
}
