import type { ConsoleAuth } from "@khoralabs/khora-console";
import { getRegistryAdminSummary } from "@khoralabs/registry-catalog";
import { registryHostRuntime } from "../../runtime";
import { withConsoleAuth } from "./console-guard";

export function handleAdminStatsSummary(
  req: Request,
  consoleAuth: ConsoleAuth | null,
): Promise<Response> {
  return withConsoleAuth(req, consoleAuth, async () =>
    Response.json(await getRegistryAdminSummary(registryHostRuntime().db)),
  );
}

export async function adminStatsSummaryResponse(): Promise<Response> {
  return Response.json(await getRegistryAdminSummary(registryHostRuntime().db));
}
