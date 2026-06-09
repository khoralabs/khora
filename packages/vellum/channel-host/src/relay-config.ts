import type { FrameRelayHubPort } from "@khoralabs/obp-frame-relay";
import {
  DEFAULT_VELLUM_MAX_CHAINS,
  type VellumMaxChains,
  zVellumMaxChains,
} from "@khoralabs/vellum-contracts";

import { MAX_CHANNEL_TTL_MS } from "./auth";
import type { ChannelRegistry } from "./registry";
import { envRelayMaxChannels } from "./relay-env";

export const DEFAULT_CHANNEL_TTL_MS = 86_400_000;

export type SingleChannelConfig = {
  channelId: string;
  creatorDid: string;
  ttlMs: number;
  maxPopulation: number | null;
  maxChains: VellumMaxChains;
};

export type RelayProfile =
  | { mode: "single"; config: SingleChannelConfig }
  | { mode: "pool"; maxRelayChannels: number };

function parseMaxPopulation(env: NodeJS.ProcessEnv): number | null {
  const raw = env.VELLUM_MAX_POPULATION?.trim();
  if (raw === undefined || raw.length === 0) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("VELLUM_MAX_POPULATION must be a positive integer when set");
  }
  return n;
}

function parseMaxChains(env: NodeJS.ProcessEnv): VellumMaxChains {
  const raw = env.VELLUM_MAX_CHAINS?.trim();
  if (raw === undefined || raw.length === 0) return DEFAULT_VELLUM_MAX_CHAINS;
  try {
    return zVellumMaxChains.parse(JSON.parse(raw) as unknown);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`VELLUM_MAX_CHAINS invalid: ${msg}`);
  }
}

export function loadRelayProfile(env: NodeJS.ProcessEnv = process.env): RelayProfile {
  const explicitMode = env.VELLUM_RELAY_MODE?.trim();
  const channelId = env.VELLUM_CHANNEL_ID?.trim();

  if (explicitMode === "pool") {
    return { mode: "pool", maxRelayChannels: envRelayMaxChannels(env) };
  }

  if (channelId !== undefined && channelId.length > 0) {
    const creatorDid = env.VELLUM_CHANNEL_CREATOR_DID?.trim();
    if (creatorDid === undefined || creatorDid.length === 0) {
      throw new Error("VELLUM_CHANNEL_CREATOR_DID is required when VELLUM_CHANNEL_ID is set");
    }
    const ttlRaw = env.VELLUM_CHANNEL_TTL_MS?.trim();
    const ttlMs = Math.min(
      ttlRaw !== undefined && ttlRaw.length > 0
        ? Number.parseInt(ttlRaw, 10)
        : DEFAULT_CHANNEL_TTL_MS,
      MAX_CHANNEL_TTL_MS,
    );
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("VELLUM_CHANNEL_TTL_MS must be a positive integer when set");
    }
    return {
      mode: "single",
      config: {
        channelId,
        creatorDid,
        ttlMs,
        maxPopulation: parseMaxPopulation(env),
        maxChains: parseMaxChains(env),
      },
    };
  }

  if (explicitMode === "single") {
    throw new Error("VELLUM_CHANNEL_ID is required for VELLUM_RELAY_MODE=single");
  }

  return { mode: "pool", maxRelayChannels: envRelayMaxChannels(env) };
}

export async function bootstrapSingleChannel(input: {
  hub: FrameRelayHubPort;
  registry: ChannelRegistry;
  config: SingleChannelConfig;
  nowMs?: number;
}): Promise<void> {
  const nowMs = input.nowMs ?? Date.now();
  const { config } = input;
  await input.hub.createChannel(config.channelId, config.ttlMs);
  input.registry.insertChannel({
    channelId: config.channelId,
    creatorDid: config.creatorDid,
    admissionMode: "invite_only",
    maxPopulation: config.maxPopulation,
    maxChains: config.maxChains,
    expiresAtMs: nowMs + config.ttlMs,
    createdAtMs: nowMs,
  });
}
