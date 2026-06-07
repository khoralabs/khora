import type { PrincipalRegistrationRequest } from "@khoralabs/host-runtime";
import { zKhoraRegisterResult, zKhoraRegistrationRequestBody } from "@khoralabs/khora-contracts";
import { inviteRequiredFromEnv, invitesPerRegistrationFromEnv } from "@khoralabs/khora-invites";
import { logger } from "../logger";
import { clientIpFromRequest } from "../rate-limit";
import type { HostRouteDeps } from "./deps";
import {
  authErrorResponse,
  jsonError,
  rateLimitedResponse,
  registrationOpaqueJson,
} from "./responses";

export async function handleRegister(req: Request, deps: HostRouteDeps): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const ip = clientIpFromRequest(req);
  const bodyText = await req.text();
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return registrationOpaqueJson(400);
  }
  const parsed = zKhoraRegistrationRequestBody.safeParse(raw);
  if (!parsed.success) {
    return registrationOpaqueJson(400);
  }
  const body = parsed.data;
  const regIp = rateLimiters.registerIp(`ip:${ip}`);
  if (!regIp.ok) {
    logger.warn({ ip, bucket: "register_ip" }, "register rate limit exceeded");
    return rateLimitedResponse(regIp.retryAfterSec);
  }
  const regDid = rateLimiters.registerDid(`did:${body.did}`);
  if (!regDid.ok) {
    logger.warn({ did: body.did, bucket: "register_did" }, "register rate limit exceeded");
    return rateLimitedResponse(regDid.retryAfterSec);
  }
  const effective = ctx.hostSpec.readEffective();
  const populationLimit = effective.populationLimit;
  if (populationLimit !== undefined) {
    const current = ctx.adminStats.registeredPrincipalCount();
    if (current >= populationLimit) {
      return jsonError("Host at population capacity", 503);
    }
  }
  if (ctx.host.persistenceClient.agentRegistrationExists(body.did)) {
    return jsonError("Already registered", 409);
  }
  const accountStatus = ctx.agentAccountStatus.getStatus(body.did);
  if (accountStatus !== undefined) {
    return jsonError("Registration not allowed", 403);
  }
  const inviteTokenRaw = body.inviteToken?.trim();
  const inviteTokenPresent = inviteTokenRaw !== undefined && inviteTokenRaw.length > 0;

  let consumedInvitePlain: string | undefined;
  if (inviteRequiredFromEnv()) {
    if (!inviteTokenPresent || ctx.invitesRepo === undefined) {
      return registrationOpaqueJson(400);
    }
  }
  if (inviteTokenPresent && ctx.invitesRepo === undefined) {
    return registrationOpaqueJson(400);
  }
  if (inviteTokenPresent && ctx.invitesRepo !== undefined) {
    if (!ctx.invitesRepo.tryConsumeInviteToken(inviteTokenRaw, body.did)) {
      return registrationOpaqueJson(400);
    }
    consumedInvitePlain = inviteTokenRaw;
  }

  const priorUsername = ctx.lookupNormalizedUsernameForPrincipal(body.did);

  const swarmReq: PrincipalRegistrationRequest = {
    principalId: body.did,
    ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    ...(body.correlationId !== undefined ? { correlationId: body.correlationId } : {}),
  };
  try {
    const ua = req.headers.get("user-agent") ?? undefined;
    const result = await ctx.host.registerPrincipal(swarmReq, {
      headers: req.headers,
      bodyText,
      client: { ip, userAgent: ua },
    });
    ctx.host.persistenceClient.upsertAgentRegistration(result.principalId, result.profileId);
    let inviteTokens: string[] | undefined;
    if (consumedInvitePlain !== undefined && ctx.invitesRepo !== undefined) {
      inviteTokens = ctx.invitesRepo.mintStandardInviteTokens(
        swarmReq.principalId,
        invitesPerRegistrationFromEnv(),
      );
    }
    const payload = zKhoraRegisterResult.parse({
      did: result.principalId,
      profileId: result.profileId,
      profile: result.profile,
      ...(inviteTokens !== undefined ? { inviteTokens } : {}),
    });
    logger.info({ did: result.principalId, profileId: result.profileId }, "principal registered");
    return Response.json(payload);
  } catch (e) {
    if (consumedInvitePlain !== undefined && ctx.invitesRepo !== undefined) {
      ctx.invitesRepo.rollbackInviteConsumption(consumedInvitePlain, swarmReq.principalId);
    }
    const msg = e instanceof Error ? e.message : String(e);
    const usernameTaken = msg.includes("unavailable");
    if (!usernameTaken) {
      ctx.rollbackUsernameMapsAfterFailedRegistration(swarmReq.principalId, priorUsername);
    }
    if (usernameTaken) {
      return Response.json(
        { error: "Username is already taken", code: "username_taken" },
        { status: 409 },
      );
    }
    if (e instanceof Error) {
      return authErrorResponse(e);
    }
    return jsonError(msg, 400);
  }
}
