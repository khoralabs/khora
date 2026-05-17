import { AgentRelay, createFrameChannelHub, createInboxWsHub } from "@khoralabs/agent-relay";
import { createAtriumDidAuth } from "@khoralabs/at2-auth";
import type { AtriumPost, AtriumProfile } from "@khoralabs/at2-contracts";
import { createRelayColonnadeSocial } from "@khoralabs/relay-colonnade";
import type { At2HostContext } from "./context.ts";
import {
  createAt2InvitesRepo,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "./invites/at2-invites.ts";
import { createAt2RelayOnEvent } from "./on-event.ts";

export async function createAt2Host(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
}): Promise<At2HostContext> {
  const { persistence, catalogDb, store, tenantKey } = await createRelayColonnadeSocial(opts);
  const seedTokens = parseInviteSeedTokens(process.env.AT2_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  let invitesRepo: At2HostContext["invitesRepo"];
  if (pepper !== undefined && pepper.length > 0) {
    invitesRepo = createAt2InvitesRepo(catalogDb, pepper);
    invitesRepo.insertSeedInviteTokens(seedTokens);
    const rootPlain = invitesRepo.ensureRootInviteIfAbsent();
    if (rootPlain !== undefined) {
      console.error("[at2-host] new root invite plaintext — store securely:", rootPlain);
    }
  } else {
    invitesRepo = undefined;
  }
  const auth = createAtriumDidAuth({ db: catalogDb });
  const inboxHub = createInboxWsHub();
  const roomHub = createFrameChannelHub({ hubPersistence: persistence.frameChannelHubPersistence });
  const host = new AgentRelay<AtriumProfile, AtriumPost, unknown, never>({
    persistence,
    authPreflight: auth.preflight,
    inboxHub,
    frameChannelHub: roomHub,
    onEvent: createAt2RelayOnEvent({ store, tenantKey, catalogDb }),
  });
  return { host, auth, store, tenantKey, catalogDb, roomHub, invitesRepo };
}
