import type { PrincipalRegistrationRequest } from "@khoralabs/agent-relay";
import {
  normalizeUsername,
  zAtriumRegisterResult,
  zAtriumRegistrationRequestBody,
} from "@khoralabs/at2-contracts";
import { inviteRequiredFromEnv, invitesPerRegistrationFromEnv } from "@khoralabs/at2-host";
import type { RelayCatalogSourceMapStore } from "@khoralabs/relay-colonnade";
import {
  relaySyntheticPointer,
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "@khoralabs/relay-colonnade";
import { clientIpFromRequest } from "../rate-limit.ts";
import type { HostRouteDeps } from "./deps.ts";
import {
  authErrorResponse,
  jsonError,
  rateLimitedResponse,
  registrationOpaqueJson,
} from "./responses.ts";

function lookupNormalizedUsernameForDid(
  store: RelayCatalogSourceMapStore,
  principalId: string,
): string | undefined {
  const hit = store.lookupProjection(
    USERNAME_INDEX_TENANT_KEY,
    SOURCE_PRINCIPAL_TO_USERNAME,
    principalId,
  );
  if (!hit.found || hit.projection === null || typeof hit.projection !== "object") {
    return undefined;
  }
  const u = (hit.projection as Record<string, unknown>).username;
  return typeof u === "string" ? u : undefined;
}

function rollbackUsernameMapsAfterRegisterFailure(
  store: RelayCatalogSourceMapStore,
  principalId: string,
  priorNormalizedUsername: string | undefined,
): void {
  const current = lookupNormalizedUsernameForDid(store, principalId);
  if (current === undefined) return;
  store.deleteRow(USERNAME_INDEX_TENANT_KEY, SOURCE_PRINCIPAL_TO_USERNAME, principalId);
  store.deleteRow(USERNAME_INDEX_TENANT_KEY, SOURCE_USERNAME_TO_PRINCIPAL, current);
  if (priorNormalizedUsername === undefined) return;
  const username = normalizeUsername(priorNormalizedUsername);
  store.upsertRow({
    tenant_key: USERNAME_INDEX_TENANT_KEY,
    source_map_id: SOURCE_USERNAME_TO_PRINCIPAL,
    entry_key: username,
    pointer: relaySyntheticPointer(
      USERNAME_INDEX_TENANT_KEY,
      SOURCE_USERNAME_TO_PRINCIPAL,
      username,
    ),
    projection: { principalId },
  });
  store.upsertRow({
    tenant_key: USERNAME_INDEX_TENANT_KEY,
    source_map_id: SOURCE_PRINCIPAL_TO_USERNAME,
    entry_key: principalId,
    pointer: relaySyntheticPointer(
      USERNAME_INDEX_TENANT_KEY,
      SOURCE_PRINCIPAL_TO_USERNAME,
      principalId,
    ),
    projection: { username },
  });
}

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
  const parsed = zAtriumRegistrationRequestBody.safeParse(raw);
  if (!parsed.success) {
    return registrationOpaqueJson(400);
  }
  const body = parsed.data;
  const regIp = rateLimiters.registerIp(`ip:${ip}`);
  if (!regIp.ok) return rateLimitedResponse(regIp.retryAfterSec);
  const regDid = rateLimiters.registerDid(`did:${body.did}`);
  if (!regDid.ok) return rateLimitedResponse(regDid.retryAfterSec);
  if (ctx.host.persistenceClient.agentRegistrationExists(body.did)) {
    return jsonError("Already registered", 409);
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

  const priorUsername = lookupNormalizedUsernameForDid(ctx.store, body.did);

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
    const payload = zAtriumRegisterResult.parse({
      did: result.principalId,
      profileId: result.profileId,
      profile: result.profile,
      ...(inviteTokens !== undefined ? { inviteTokens } : {}),
    });
    return Response.json(payload);
  } catch (e) {
    if (consumedInvitePlain !== undefined && ctx.invitesRepo !== undefined) {
      ctx.invitesRepo.rollbackInviteConsumption(consumedInvitePlain, swarmReq.principalId);
    }
    const msg = e instanceof Error ? e.message : String(e);
    const usernameTaken = msg.includes("unavailable");
    if (!usernameTaken) {
      rollbackUsernameMapsAfterRegisterFailure(ctx.store, swarmReq.principalId, priorUsername);
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
