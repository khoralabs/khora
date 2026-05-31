import type { ConsoleAuth } from "@khoralabs/khora-console";
import { getRegistryAdminSummary } from "@khoralabs/users";
import { getRegistryDatabase } from "@khoralabs/users-auth";
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
