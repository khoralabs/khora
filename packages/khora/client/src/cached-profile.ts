import { readFileSync } from "node:fs";
import {
  type KhoraPost,
  type KhoraProfile,
  zKhoraPost,
  zKhoraProfile,
} from "@khoralabs/khora-contracts";
import z from "zod";
import type { KhoraAppConfigBase } from "./config/schema.ts";
import { createKhoraResolvePath, KHORA_BUILTIN_PLUGIN_ID } from "./khora-plugins.ts";

/**
 * Persistence envelope written by the profile-sync plugin. Re-declared here (rather than imported
 * from `@khoralabs/khora-profile-sync`) because the client should not depend on the plugin
 * package; the on-disk shape is the contract.
 */
const zProfileSyncStateFileV1 = z.object({
  version: z.literal(1),
  syncedAtMs: z.number().int().nonnegative(),
  did: z.string().min(1),
  profile: zKhoraProfile,
  topicSlugs: z.array(z.string()),
  authorTopics: z
    .array(z.object({ authorDid: z.string(), topicSlug: z.string() }))
    .optional()
    .default([]),
  subscriptions: z.array(zKhoraPost),
});

export type CachedProfileSnapshot = {
  did: string;
  profile: KhoraProfile;
  topicSlugs: string[];
  authorTopics: { authorDid: string; topicSlug: string }[];
  subscriptions: KhoraPost[];
  syncedAtMs: number;
};

/** Read & validate a profile-sync state file. Returns `undefined` if missing or malformed. */
export function loadCachedProfile(filePath: string): CachedProfileSnapshot | undefined {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = zProfileSyncStateFileV1.safeParse(raw);
  if (!parsed.success) return undefined;
  return {
    did: parsed.data.did,
    profile: parsed.data.profile,
    topicSlugs: parsed.data.topicSlugs,
    authorTopics: parsed.data.authorTopics,
    subscriptions: parsed.data.subscriptions,
    syncedAtMs: parsed.data.syncedAtMs,
  };
}

/**
 * Compute the absolute path of the profile-sync cache file from a loaded config. Returns
 * `undefined` when the plugin is disabled or unconfigured.
 */
export function resolveProfileSyncPath(cfg: KhoraAppConfigBase): string | undefined {
  const entry = cfg.plugins?.[KHORA_BUILTIN_PLUGIN_ID.profileSync];
  if (entry === undefined || entry === false) return undefined;
  const rel = (entry as { filePath?: unknown }).filePath;
  if (typeof rel !== "string" || rel.length === 0) return undefined;
  return createKhoraResolvePath(cfg.dataDir)(rel);
}

/**
 * Serialize a snapshot in the profile-sync envelope. Used by callers (e.g. `khora register`) to
 * seed the cache file before the plugin's first flush, so offline reads work immediately.
 */
export function serializeProfileSyncStateFile(snap: CachedProfileSnapshot): string {
  const envelope = {
    version: 1 as const,
    syncedAtMs: snap.syncedAtMs,
    did: snap.did,
    profile: snap.profile,
    topicSlugs: snap.topicSlugs,
    authorTopics: snap.authorTopics,
    subscriptions: snap.subscriptions,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}
