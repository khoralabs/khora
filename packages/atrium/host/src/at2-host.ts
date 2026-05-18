import { AgentRelay, createFrameChannelHub, createInboxWsHub } from "@khoralabs/agent-relay";
import { createAtriumDidAuth } from "@khoralabs/at2-auth";
import type { AtriumPost, AtriumProfile } from "@khoralabs/at2-contracts";
import type { AtriumRoomLifecycleHostEvent } from "@khoralabs/at2-transport";
import { createRelayColonnadeSocial } from "@khoralabs/relay-colonnade";
import type { AtriumHostContext } from "./context.ts";
import {
  createAtriumInvitesRepo,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "./invites/at2-invites.ts";
import { createAtriumRelayOnEvent } from "./on-event.ts";

export async function createAtriumHost(opts: {
  catalogPath: string;
  framesDbPath: string;
  tenantKey?: string;
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
}): Promise<AtriumHostContext> {
  const { persistence, social, catalogDb, framesDb, store, tenantKey } =
    await createRelayColonnadeSocial(opts);
  const seedTokens = parseInviteSeedTokens(process.env.ATRIUM_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  let invitesRepo: AtriumHostContext["invitesRepo"];
  if (pepper !== undefined && pepper.length > 0) {
    invitesRepo = createAtriumInvitesRepo(catalogDb, pepper);
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
  const roomHub = createFrameChannelHub({
    hubPersistence: persistence.frameChannelHubPersistence,
  });
  const host = new AgentRelay<AtriumProfile, AtriumPost, unknown, never>({
    persistence,
    authPreflight: auth.preflight,
    inboxHub,
    frameChannelHub: roomHub,
    onEvent: createAtriumRelayOnEvent({ store, tenantKey, catalogDb }),
  });
  return {
    host,
    auth,
    store,
    tenantKey,
    catalogDb,
    framesDb,
    roomHub,
    social,
    invitesRepo,
    ...(opts.roomLifecycle !== undefined ? { roomLifecycle: opts.roomLifecycle } : {}),
  };
}
