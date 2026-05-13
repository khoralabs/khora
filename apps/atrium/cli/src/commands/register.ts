import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AtriumProfile,
  resolveProfileSyncPath,
  serializeProfileSyncStateFile,
} from "@khoralabs/atrium-client";
import { cliAppConfig } from "../app-config.ts";
import type { AtriumCliContext } from "../flows/context.ts";
import { runRegisterInteractiveFlow } from "../flows/register-flow.ts";
import { strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function registerUseLegacy(flags: FlagMap): boolean {
  return (
    strFlag(flags, "username") !== undefined ||
    strFlag(flags, "display-name") !== undefined ||
    strFlag(flags, "displayName") !== undefined ||
    strFlag(flags, "bio") !== undefined ||
    strFlag(flags, "invite-token") !== undefined ||
    strFlag(flags, "inviteToken") !== undefined
  );
}

/**
 * Seed the profile-sync cache file right after registration. The profile-sync plugin will
 * overwrite it on its first event-driven flush; this guarantees `atrium whoami` works offline
 * immediately, before that flush. No-op when the plugin isn't configured.
 */
export function seedProfileCacheAfterRegister(did: string, profile: AtriumProfile): void {
  const cachePath = resolveProfileSyncPath(cliAppConfig);
  if (cachePath === undefined) return;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(
      cachePath,
      serializeProfileSyncStateFile({
        did,
        profile,
        topicSlugs: [],
        authorTopics: [],
        probes: [],
        syncedAtMs: Date.now(),
      }),
      "utf8",
    );
  } catch {
    /* best-effort; the plugin will catch up shortly */
  }
}

export async function runRegisterCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const { client } = ctx;
  if (registerUseLegacy(flags)) {
    const username = strFlag(flags, "username");
    if (username === undefined || username.length === 0) {
      console.error("register: --username is required when running non-interactively");
      process.exit(1);
    }
    const displayName = strFlag(flags, "display-name") ?? strFlag(flags, "displayName");
    const bio = strFlag(flags, "bio");
    const inviteToken = strFlag(flags, "invite-token") ?? strFlag(flags, "inviteToken");
    const metadata: Record<string, unknown> = {
      username,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(bio !== undefined ? { bio } : {}),
    };
    const result = await client.register({
      metadata,
      ...(inviteToken !== undefined && inviteToken.length > 0 ? { inviteToken } : {}),
    });
    seedProfileCacheAfterRegister(result.did, result.profile);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  await runRegisterInteractiveFlow(ctx);
}
