import { zKhoraHostSpecPatch } from "@khoralabs/khora-contracts";
import z from "zod";
import { withAdminTokenAuth } from "./admin-token-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

const zHostConfigPatch = z.object({
  populationLimit: z.number().int().positive().nullable().optional(),
});

export async function handleAdminHostConfigGet(
  req: Request,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, async () => {
    const effective = deps.ctx.hostSpec.readEffective();
    return Response.json({
      populationCurrent: deps.ctx.adminStats.registeredPrincipalCount(),
      ...(effective.populationLimit !== undefined
        ? { populationLimit: effective.populationLimit }
        : {}),
    });
  });
}

export async function handleAdminHostConfigPatch(
  req: Request,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, async () => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError("Invalid JSON", 400);
    }
    const parsed = zHostConfigPatch.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Invalid host config", 400);
    }
    if (parsed.data.populationLimit !== undefined) {
      const patch = zKhoraHostSpecPatch.parse({
        populationLimit: parsed.data.populationLimit,
      });
      deps.ctx.hostSpec.patch(patch);
    }
    const effective = deps.ctx.hostSpec.readEffective();
    return Response.json({
      populationCurrent: deps.ctx.adminStats.registeredPrincipalCount(),
      ...(effective.populationLimit !== undefined
        ? { populationLimit: effective.populationLimit }
        : {}),
    });
  });
}
