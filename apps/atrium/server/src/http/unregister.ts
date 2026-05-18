import type { PrincipalRegistrationRequest } from "@khoralabs/agent-relay";
import { zAtriumUnregisterRequestBody } from "@khoralabs/atrium-contracts";
import { logger } from "../logger.ts";
import { clientIpFromRequest } from "../rate-limit.ts";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, rateLimitedResponse, registrationOpaqueJson } from "./responses.ts";

export async function handleUnregister(req: Request, deps: HostRouteDeps): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const ip = clientIpFromRequest(req);
  const bodyText = await req.text();
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return registrationOpaqueJson(400);
  }
  const parsed = zAtriumUnregisterRequestBody.safeParse(raw);
  if (!parsed.success) {
    return registrationOpaqueJson(400);
  }
  const body = parsed.data;
  const swarmReq: PrincipalRegistrationRequest = {
    principalId: body.did,
    ...(body.correlationId !== undefined ? { correlationId: body.correlationId } : {}),
  };
  try {
    await ctx.auth.verifyUnregister(req, bodyText, swarmReq);
  } catch (e) {
    return authErrorResponse(e);
  }
  const regIp = rateLimiters.registerIp(`ip:${ip}`);
  if (!regIp.ok) return rateLimitedResponse(regIp.retryAfterSec);
  const regDid = rateLimiters.registerDid(`did:${body.did}`);
  if (!regDid.ok) return rateLimitedResponse(regDid.retryAfterSec);

  if (!ctx.host.persistenceClient.agentRegistrationExists(body.did)) {
    return new Response(null, { status: 204 });
  }

  ctx.phase1UnregisterPrincipal(body.did);

  logger.info({ did: body.did }, "principal unregistered");
  return new Response(null, { status: 204 });
}
