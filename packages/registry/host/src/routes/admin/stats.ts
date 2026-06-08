import type { ConsoleAuth } from "@khoralabs/khora-console";
import { getRegistryAdminSummary } from "@khoralabs/registry-catalog";
import { registryHostRuntime } from "../../runtime";
import { withConsoleAuth } from "./console-guard";

export function handleAdminStatsSummary(
  req: Request,
  consoleAuth: ConsoleAuth | null,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, () =>
    Response.json(getRegistryAdminSummary(registryHostRuntime().db)),
  );
}

export function adminStatsSummaryResponse(): Response {
  return Response.json(getRegistryAdminSummary(registryHostRuntime().db));
}
