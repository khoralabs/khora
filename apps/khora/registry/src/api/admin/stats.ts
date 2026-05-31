import type { ConsoleAuth } from "@khoralabs/khora-console";
import { getRegistryDatabase } from "@khoralabs/registry-auth";
import { getRegistryAdminSummary } from "@khoralabs/registry-catalog";
import { withConsoleAuth } from "./console-guard";

export function handleAdminStatsSummary(
  req: Request,
  consoleAuth: ConsoleAuth | null,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () =>
    Response.json(getRegistryAdminSummary(getRegistryDatabase())),
  );
}

export function adminStatsSummaryResponse(): Response {
  return Response.json(getRegistryAdminSummary(getRegistryDatabase()));
}
