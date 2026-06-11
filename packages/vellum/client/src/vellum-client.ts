import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultIdentityPath, loadIdentity } from "@khoralabs/agent-persisted-signer";
import { validateNbcBindPayloadForPort } from "@khoralabs/nbc-bind-policy";
import {
  canonicalSessionParties,
  normalizeSessionInit,
  sessionInitToWire,
} from "@khoralabs/obp-frames-impl";
import type { JsonDocument } from "@khoralabs/obp-model";
import { RelayClient } from "@khoralabs/relay-client";
import {
  type ChainInitResponse,
  ChainInitResponseSchema,
  type ChainStateResponse,
  ChainStateResponseSchema,
  cfgDataDir,
  channelSqlitePath,
  channelVellumControlPath,
  DEFAULT_GENESIS_TURN_WIRE,
  type VellumChainRow,
  type VellumOfferRow,
  type VellumPathConfig,
  type VellumPortRow,
} from "@khoralabs/vellum-contracts";
import {
  createVellumControlTransportFromEnv,
  type VellumControlTransport,
} from "@khoralabs/vellum-transport";
import { createFrameSignerFromPersistableAgent } from "./frame-signer";
import { isPidAlive } from "./list-local-vellum";
import { SqliteVellumReadModel } from "./persistence/sqlite-vellum-read-persistence";
import type { VellumReadModel } from "./persistence/vellum-read-persistence";

export type VellumConnectResult = "spawned" | "already-running";

export type VellumClientOptions = {
  /** Vellum channel-relay HTTP origin. */
  relayBaseUrl: string;
  channelId: string;
  dataDir?: string | undefined;
  /** Override how channel metadata is read (defaults to SQLite under the configured data dir). */
  readPersistence?: VellumReadModel | undefined;
  /** Defaults to env-selected HTTP (`VELLUM_CONTROL_TRANSPORT`, default `http`). */
  controlTransport?: VellumControlTransport | undefined;
};

function readControlPlane(
  cfg: VellumPathConfig,
  channelId: string,
): { controlPort: number; pid: number } | undefined {
  try {
    const p = channelVellumControlPath(cfgDataDir(cfg), channelId);
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (j !== null && typeof j === "object") {
      const o = j as Record<string, unknown>;
      if (typeof o.controlPort === "number" && typeof o.pid === "number") {
        return { controlPort: o.controlPort, pid: o.pid };
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function waitForControlPlane(
  cfg: VellumPathConfig,
  channelId: string,
  deadlineMs: number,
): Promise<{ controlPort: number }> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const c = readControlPlane(cfg, channelId);
    if (c !== undefined) return { controlPort: c.controlPort };
    await Bun.sleep(50);
  }
  throw new Error("timeout waiting for vellum.json control server");
}

function randomGenesisSha256(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

function daemonEntryPath(): string {
  return fileURLToPath(new URL("../../daemon/src/index.ts", import.meta.url));
}

function httpFailMessage(statusText: string, j: unknown): string {
  if (typeof j === "object" && j !== null && "error" in j) {
    return String((j as { error: unknown }).error);
  }
  return statusText;
}

export class VellumClient {
  readonly pathConfig: VellumPathConfig;

  private readonly reads: VellumReadModel;
  private cachedControlTransport: VellumControlTransport | undefined;

  constructor(public readonly opts: VellumClientOptions) {
    const d = opts.dataDir?.trim();
    this.pathConfig = {
      dataDir: d !== undefined && d.length > 0 ? d : undefined,
    };
    this.reads =
      opts.readPersistence ??
      new SqliteVellumReadModel(channelSqlitePath(cfgDataDir(this.pathConfig), opts.channelId));
  }

  private controlBaseUrl(): string {
    const cp = readControlPlane(this.pathConfig, this.opts.channelId);
    if (cp === undefined) {
      throw new Error("Vellum daemon control not available (run `vellum connect` first)");
    }
    return `http://127.0.0.1:${cp.controlPort}`;
  }

  private control(): VellumControlTransport {
    if (this.opts.controlTransport !== undefined) return this.opts.controlTransport;
    if (this.cachedControlTransport === undefined) {
      this.cachedControlTransport = createVellumControlTransportFromEnv({
        resolveBaseUrl: () => this.controlBaseUrl(),
      });
    }
    return this.cachedControlTransport;
  }

  /** Ensure channel daemon is running with a fresh ticket and local control server. */
  async connect(options?: {
    webSocketUrl?: string;
    upgradeNonce?: string;
  }): Promise<VellumConnectResult> {
    const existing = readControlPlane(this.pathConfig, this.opts.channelId);
    if (existing !== undefined && isPidAlive(existing.pid)) {
      return "already-running";
    }

    const idPath =
      process.env.VELLUM_AGENT_KEY_PATH?.trim() ??
      process.env.KHORA_AGENT_KEY_PATH?.trim() ??
      defaultIdentityPath();
    const signer = await loadIdentity(idPath);
    if (signer === undefined) {
      throw new Error(`identity not found at ${idPath}`);
    }
    let webSocketUrl = options?.webSocketUrl ?? process.env.VELLUM_CHANNEL_WS_URL?.trim();
    let upgradeNonce = options?.upgradeNonce ?? process.env.VELLUM_CHANNEL_WS_NONCE?.trim();
    if (
      webSocketUrl === undefined ||
      webSocketUrl.length === 0 ||
      upgradeNonce === undefined ||
      upgradeNonce.length === 0
    ) {
      const cc = new RelayClient({ relayBaseUrl: this.opts.relayBaseUrl, signer });
      const out = await cc.mintTicket(this.opts.channelId);
      webSocketUrl = out.webSocketUrl;
      upgradeNonce = out.upgradeNonce;
    }

    const dataDir =
      this.opts.dataDir !== undefined && this.opts.dataDir.length > 0
        ? this.opts.dataDir
        : undefined;
    Bun.spawn({
      cmd: ["bun", "run", daemonEntryPath()],
      env: {
        ...process.env,
        VELLUM_CHANNEL_ID: this.opts.channelId,
        VELLUM_CHANNEL_WS_URL: webSocketUrl,
        VELLUM_CHANNEL_WS_NONCE: upgradeNonce,
        VELLUM_BASE_URL: this.opts.relayBaseUrl,
        ...(dataDir !== undefined ? { VELLUM_DATA_DIR: dataDir } : {}),
      },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    await waitForControlPlane(this.pathConfig, this.opts.channelId, 15_000);
    return "spawned";
  }

  async chainCreate(input: {
    sessionId?: string;
    genesisHash?: string;
    myPartyId?: string;
    peerPartyId: string;
    peerActorPubkeyHex: string;
    /** Counterparty DID for relay chain allocation (required). */
    counterpartyDid: string;
    /** NBC genesis body (extend + ≥1 port, no bind); defaults to {@link DEFAULT_GENESIS_TURN_WIRE}. */
    genesisTurn?: Record<string, unknown>;
  }): Promise<ChainInitResponse> {
    const idPath =
      process.env.VELLUM_AGENT_KEY_PATH?.trim() ??
      process.env.KHORA_AGENT_KEY_PATH?.trim() ??
      defaultIdentityPath();
    const signer = await loadIdentity(idPath);
    if (signer === undefined) {
      throw new Error(`identity not found at ${idPath}`);
    }
    const frameSigner = await createFrameSignerFromPersistableAgent(signer);
    const myPid = input.myPartyId?.trim() ?? randomUUID();
    const sessionId = input.sessionId?.trim() ?? randomUUID();
    const genesis = input.genesisHash?.trim() ?? randomGenesisSha256();
    const parties = canonicalSessionParties([
      { id: myPid, pubkey: frameSigner.actor },
      { id: input.peerPartyId.trim(), pubkey: input.peerActorPubkeyHex.trim() },
    ]);
    const norm = normalizeSessionInit({
      session_id: sessionId,
      genesis_hash: genesis,
      parties,
    });
    const channelClient = new RelayClient({
      relayBaseUrl: this.opts.relayBaseUrl,
      signer,
    });
    await channelClient.allocateSession(this.opts.channelId, {
      counterpartyDid: input.counterpartyDid.trim(),
      sessionId: norm.session_id,
    });

    const payload = {
      init: sessionInitToWire(norm),
      genesis_turn: input.genesisTurn ?? DEFAULT_GENESIS_TURN_WIRE,
    };
    try {
      const res = await this.control().fetch("/chain/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(httpFailMessage(res.statusText, j));
      }
      return ChainInitResponseSchema.parse(j);
    } catch (e) {
      await channelClient.releaseSession(this.opts.channelId, norm.session_id).catch(() => {});
      throw e;
    }
  }

  /** Release a bilateral chain slot on the relay (frees quota). */
  async chainRelease(sessionId: string): Promise<void> {
    const idPath =
      process.env.VELLUM_AGENT_KEY_PATH?.trim() ??
      process.env.KHORA_AGENT_KEY_PATH?.trim() ??
      defaultIdentityPath();
    const signer = await loadIdentity(idPath);
    if (signer === undefined) {
      throw new Error(`identity not found at ${idPath}`);
    }
    const channelClient = new RelayClient({
      relayBaseUrl: this.opts.relayBaseUrl,
      signer,
    });
    await channelClient.releaseSession(this.opts.channelId, sessionId.trim());
  }

  async sendTurn(sessionId: string, body: Record<string, unknown>): Promise<void> {
    const res = await this.control().fetch("/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, body }),
    });
    const j: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(httpFailMessage(res.statusText, j));
    }
  }

  async getChainSnapshot(): Promise<ChainStateResponse> {
    const res = await this.control().fetch("/chain");
    const j: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(httpFailMessage(res.statusText, j));
    }
    return ChainStateResponseSchema.parse(j);
  }

  listChainsFromStore(): VellumChainRow[] {
    return this.reads.listChains();
  }

  listOffers(): VellumOfferRow[] {
    return this.reads.listOffers();
  }

  readOffer(offerId: string): VellumOfferRow | undefined {
    return this.reads.readOffer(offerId);
  }

  listPortsForOffer(offerId: string): string[] {
    return this.reads.listPortIdsForOffer(offerId);
  }

  readPort(portId: string): VellumPortRow | undefined {
    return this.reads.readPort(portId);
  }

  readPolicySnapshot(portId: string): unknown | null {
    return this.readPort(portId)?.bind_policy ?? null;
  }

  validatePolicy(portId: string, payload: unknown): Record<string, unknown> {
    const port = this.readPort(portId);
    if (port === undefined) {
      throw new Error(`port not found: ${portId}`);
    }
    return validateNbcBindPayloadForPort(port.bind_policy as JsonDocument | null, payload);
  }
}
