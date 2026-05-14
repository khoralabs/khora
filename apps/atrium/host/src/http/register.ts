import { zAtriumRegistrationRequestBody } from "@khoralabs/atrium-contracts";
import type { PrincipalRegistrationRequest } from "@khoralabs/swarm-host";
import { allowReregister } from "../env.ts";
import { inviteRequiredFromEnv, invitesPerRegistrationFromEnv } from "../invites/index.ts";
import { clientIpFromRequest } from "../rate-limit.ts";
import type { HostRouteDeps } from "./deps.ts";
import { rateLimitedResponse, registrationOpaqueJson } from "./responses.ts";

export async function handleRegister(req: Request, deps: HostRouteDeps): Promise<Response> {
  const { ctx, invitesRepo, rateLimiters } = deps;
  const ip = clientIpFromRequest(req);
  const bodyText = await req.text();
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return registrationOpaqueJson(400);
  }
  const parsedBody = zAtriumRegistrationRequestBody.safeParse(raw);
  if (!parsedBody.success) {
    return registrationOpaqueJson(400);
  }
  const bodyFull = parsedBody.data;
  const swarmReq: PrincipalRegistrationRequest = {
    principalId: bodyFull.did,
    ...(bodyFull.metadata !== undefined ? { metadata: bodyFull.metadata } : {}),
    ...(bodyFull.correlationId !== undefined ? { correlationId: bodyFull.correlationId } : {}),
  };

  const regIp = rateLimiters.registerIp(`ip:${ip}`);
  if (!regIp.ok) return rateLimitedResponse(regIp.retryAfterSec);
  const regDid = rateLimiters.registerDid(`did:${swarmReq.principalId}`);
  if (!regDid.ok) return rateLimitedResponse(regDid.retryAfterSec);

  if (
    !allowReregister() &&
    ctx.host.persistenceClient.agentRegistrationExists(swarmReq.principalId)
  ) {
    return registrationOpaqueJson(409);
  }

  const skipInvites = ctx.host.persistenceClient.agentRegistrationExists(swarmReq.principalId);
  const inviteTokenRaw = bodyFull.inviteToken?.trim();
  const inviteTokenPresent = inviteTokenRaw !== undefined && inviteTokenRaw.length > 0;

  let consumedInvitePlain: string | undefined;
  if (!skipInvites) {
    if (inviteRequiredFromEnv()) {
      if (!inviteTokenPresent || invitesRepo === undefined) {
        return registrationOpaqueJson(400);
      }
    }
    if (inviteTokenPresent && invitesRepo === undefined) {
      return registrationOpaqueJson(400);
    }
    if (inviteTokenPresent && invitesRepo !== undefined) {
      if (!invitesRepo.tryConsumeInviteToken(inviteTokenRaw, swarmReq.principalId)) {
        return registrationOpaqueJson(400);
      }
      consumedInvitePlain = inviteTokenRaw;
    }
  }

  // Snapshot the pre-existing username (if any) so we can roll back on failure without
  // stranding a returning DID's reservation under `ATRIUM_ALLOW_REREGISTER=1`.
  const priorUsername = ctx.usernamesRepo.lookupByDid(swarmReq.principalId)?.username;

  try {
    const ua = req.headers.get("user-agent") ?? undefined;
    const result = await ctx.host.registerPrincipal(swarmReq, {
      headers: req.headers,
      bodyText,
      client: { ip, userAgent: ua },
    });
    ctx.host.persistenceClient.upsertAgentRegistration(result.principalId, result.profileId);
    let inviteTokens: string[] | undefined;
    if (!skipInvites && consumedInvitePlain !== undefined && invitesRepo !== undefined) {
      inviteTokens = invitesRepo.mintStandardInviteTokens(
        swarmReq.principalId,
        invitesPerRegistrationFromEnv(),
      );
    }
    const body = {
      did: result.principalId,
      profileId: result.profileId,
      profile: result.profile,
      ...(inviteTokens !== undefined ? { inviteTokens } : {}),
    };
    return Response.json(body);
  } catch (e) {
    if (consumedInvitePlain !== undefined && invitesRepo !== undefined) {
      invitesRepo.rollbackInviteConsumption(consumedInvitePlain, swarmReq.principalId);
    }
    const msg = e instanceof Error ? e.message : String(e);
    const usernameTaken = msg.includes("USERNAME_TAKEN");
    if (!usernameTaken) {
      // Reservation may have been performed by the build handler before the later failure.
      // Restore the prior name (re-register path) or release entirely (new registration).
      const current = ctx.usernamesRepo.lookupByDid(swarmReq.principalId);
      if (priorUsername === undefined) {
        ctx.usernamesRepo.release(swarmReq.principalId);
      } else if (current !== undefined && current.username !== priorUsername) {
        ctx.usernamesRepo.rename(swarmReq.principalId, priorUsername);
      }
    }
    if (usernameTaken) {
      return Response.json(
        { error: "Username is already taken", code: "username_taken" },
        { status: 409 },
      );
    }
    console.error("[atrium] registration error", e);
    return registrationOpaqueJson(400);
  }
}
