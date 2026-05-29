import type { ConsoleAuth } from "@khoralabs/khora-console";
import { activateKhoraHost } from "@khoralabs/users";
import { getRegistryDatabase } from "@khoralabs/users-auth";
import { hostToFullJson } from "../host-json.ts";
import { withConsoleAuth } from "./console-guard.ts";

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
      return Response.json({ host: hostToFullJson(host) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "activate failed";
      const status = msg.includes("not found") ? 404 : 400;
      return Response.json({ error: msg }, { status });
    }
  });
}
