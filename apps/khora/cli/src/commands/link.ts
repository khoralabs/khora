import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, style } from "@khoralabs/cli-kit";
import { cliBaseUrl, cliCurrentHostSlug, loadSigner } from "../flows/context";
import { khoraCliResolvedConfig } from "../khora-app-config";
import {
  deviceAuthorize,
  devicePollToken,
  linkAgent,
  linkChallenge,
  linkStatus,
  linkUnlink,
} from "../registry/client";
import { cliRegistryUrl } from "../registry/config";
import { discoverRegisteredHostSlugs } from "../registry/link-propagate";
import { clearLinkState, readLinkState, writeLinkState } from "../registry/link-state";
import {
  clearRegistrySessionCookie,
  loadRegistrySessionCookie,
  saveRegistrySessionCookie,
} from "../registry/session-store";

async function openVerificationUrl(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await Bun.$`open ${url}`.quiet().nothrow();
    return;
  }
  if (process.platform === "linux") {
    await Bun.$`xdg-open ${url}`.quiet().nothrow();
  }
}

export async function handleLink(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const noOpen = boolFlag(flags, "no-open");
  const registryUrl = cliRegistryUrl(flags);
  const hostBaseUrl = cliBaseUrl(flags);
  const hostSlug = cliCurrentHostSlug(flags);

  if (hostSlug === undefined) {
    throw new Error(
      "No host selected. Run khora host use <slug> or pass --host=<slug> before khora link.",
    );
  }

  const signer = await loadSigner(flags);
  const auth = await deviceAuthorize(registryUrl);

  if (!json) {
    console.log(`Open this URL to sign in and approve the CLI:\n  ${auth.verification_url}`);
    console.log(`Code: ${style.bold(auth.user_code)}`);
  }

  if (!noOpen) {
    await openVerificationUrl(auth.verification_url);
  }

  if (!json) {
    console.log("Waiting for browser approval…");
  }

  const sessionCookie = await devicePollToken(registryUrl, auth.device_code, auth.expires_in);
  saveRegistrySessionCookie(sessionCookie);

  const sessionCheck = await linkStatus(registryUrl);
  if (sessionCheck === null) {
    clearRegistrySessionCookie();
    throw new Error(
      "Registry session could not be verified after browser approval. Run khora link again and complete sign-in + Approve CLI.",
    );
  }

  const cfg = khoraCliResolvedConfig(flags);
  const propagateHostSlugs =
    cfg.hosts !== undefined ? await discoverRegisteredHostSlugs(signer, cfg.hosts, hostSlug) : [];

  const { challengeId } = await linkChallenge(registryUrl, signer.did);
  const result = await linkAgent(registryUrl, signer, {
    challengeId,
    hostBaseUrl,
    hostSlug,
    propagateHostSlugs,
  });

  const linkedAtMs = Date.now();
  const state = readLinkState();
  state.currentHost = hostSlug;
  const entry = state.links[hostSlug] ?? { agents: {} };
  entry.agents[signer.did] = linkedAtMs;
  state.links[hostSlug] = entry;
  for (const row of result.propagated ?? []) {
    if (row.ok && row.hostSlug !== null && row.hostSlug.length > 0) {
      const propagatedEntry = state.links[row.hostSlug] ?? { agents: {} };
      propagatedEntry.agents[signer.did] = linkedAtMs;
      state.links[row.hostSlug] = propagatedEntry;
    }
  }
  writeLinkState(state);

  if (json) {
    console.log(JSON.stringify({ session: true, hostSlug, link: result }, null, 2));
    return;
  }
  console.log(`Linked ${signer.did} to registry account on host ${hostSlug} (${hostBaseUrl})`);
  const propagated = result.propagated ?? [];
  if (propagated.length > 0) {
    for (const row of propagated) {
      if (row.ok) {
        console.log(`  Also linked on ${row.hostSlug ?? "host"}`);
      } else {
        console.log(`  ${row.hostSlug ?? "host"}: ${row.error ?? "failed"}`);
      }
    }
  }
}

export async function handleLinkStatus(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const registryUrl = cliRegistryUrl(flags);
  const local = readLinkState();
  const remote = loadRegistrySessionCookie() !== null ? await linkStatus(registryUrl) : null;

  if (json) {
    console.log(JSON.stringify({ local, remote }, null, 2));
    return;
  }

  if (Object.keys(local.links).length === 0 && remote === null) {
    console.log("Not linked. Run khora link to connect a registry account.");
    return;
  }

  if (local.currentHost !== undefined && local.currentHost !== null) {
    console.log(`Current host: ${local.currentHost}`);
  }
  for (const [slug, entry] of Object.entries(local.links)) {
    for (const [did, at] of Object.entries(entry.agents)) {
      console.log(`${slug}: ${did} (linked ${new Date(at).toISOString()})`);
    }
  }
  if (remote !== null) {
    console.log(`Registry: ${registryUrl}`);
    console.log(JSON.stringify(remote, null, 2));
  }
}

export async function handleLinkUnlink(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const registryUrl = cliRegistryUrl(flags);
  const hostBaseUrl = cliBaseUrl(flags);
  const hostSlug = cliCurrentHostSlug(flags);
  const signer = await loadSigner(flags);

  if (hostSlug === undefined) {
    throw new Error("No host selected. Run khora host use <slug> or pass --host=<slug>.");
  }

  await linkUnlink(registryUrl, { hostBaseUrl, hostSlug, agentDid: signer.did });
  clearRegistrySessionCookie();

  const state = readLinkState();
  const entry = state.links[hostSlug];
  if (entry !== undefined) {
    delete entry.agents[signer.did];
    if (Object.keys(entry.agents).length === 0) {
      delete state.links[hostSlug];
    }
  }
  if (state.currentHost === hostSlug && state.links[hostSlug] === undefined) {
    state.currentHost = null;
  }
  if (Object.keys(state.links).length === 0) {
    clearLinkState();
  } else {
    writeLinkState(state);
  }

  if (json) {
    console.log(
      JSON.stringify({ ok: true, unlinked: true, hostSlug, agentDid: signer.did }, null, 2),
    );
    return;
  }
  console.log(
    `Unlinked ${signer.did} from registry account on host ${hostSlug} and cleared session.`,
  );
}
