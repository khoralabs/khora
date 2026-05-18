import { AgentRelay, createFrameChannelHub, createInboxWsHub } from "@khoralabs/agent-relay";
import { createAtriumDidAuth } from "@khoralabs/atrium-auth";
import type { AtriumPost, AtriumProfile } from "@khoralabs/atrium-contracts";
import type { AtriumRoomLifecycleHostEvent } from "@khoralabs/atrium-transport";
import {
  ColonnadePublicationClient,
  createSqliteColonnadeCluster,
} from "@khoralabs/colonnade-persistence";
import { createRelayColonnadeSocial } from "@khoralabs/relay-colonnade";
import type { AtriumHostContext } from "./context.ts";
import {
  createAtriumInvitesRepo,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "./invites/atrium-invites.ts";
import { createAtriumRelayOnEvent } from "./on-event.ts";

export async function createAtriumHost(opts: {
  catalogPath: string;
  framesDbPath: string;
  cellsDir: string;
  cellPoolCount?: number;
  /**
   * When true (default), each cell SQLite runs in a Bun `Worker` (same as bench `--cell-workers`).
   * Set false for main-thread `bun:sqlite` (comparable to bench `--strategy sqlite` without `--cell-workers`).
   */
  useCellWorkers?: boolean;
  tenantKey?: string;
  roomLifecycle?: (event: AtriumRoomLifecycleHostEvent) => void;
}): Promise<AtriumHostContext> {
  const cellPoolCount = opts.cellPoolCount ?? 16;
  const useCellWorkers = opts.useCellWorkers ?? true;
  const { persistence, social, catalogDb, framesDb, store, tenantKey } =
    await createRelayColonnadeSocial(opts);
  const cluster = createSqliteColonnadeCluster({
    catalogPath: opts.catalogPath,
    cellsDirectory: opts.cellsDir,
    mode: { kind: "pool", cellCount: cellPoolCount },
    useCellWorkers,
  });
  const publicationClient = new ColonnadePublicationClient(cluster.catalog, cluster.resolveCell);
  const seedTokens = parseInviteSeedTokens(process.env.ATRIUM_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  let invitesRepo: AtriumHostContext["invitesRepo"];
  if (pepper !== undefined && pepper.length > 0) {
    invitesRepo = createAtriumInvitesRepo(catalogDb, pepper);
    invitesRepo.insertSeedInviteTokens(seedTokens);
    const rootPlain = invitesRepo.ensureRootInviteIfAbsent();
    if (rootPlain !== undefined) {
      console.error("[atrium-host] new root invite plaintext — store securely:", rootPlain);
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
    onEvent: createAtriumRelayOnEvent({
      store,
      tenantKey,
      catalogDb,
      cluster,
      publicationClient,
    }),
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
    cluster,
    publicationClient,
    cellPoolCount,
    ...(opts.roomLifecycle !== undefined ? { roomLifecycle: opts.roomLifecycle } : {}),
  };
}
