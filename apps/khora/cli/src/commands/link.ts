import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, style } from "@khoralabs/cli-kit";
import { cliBaseUrl, cliCurrentHostSlug, loadSigner } from "../flows/context.ts";
import {
  deviceAuthorize,
  devicePollToken,
  linkAgent,
  linkChallenge,
  linkStatus,
  linkUnlink,
} from "../registry/client.ts";
import { cliRegistryUrl } from "../registry/config.ts";
import { clearLinkState, readLinkState, writeLinkState } from "../registry/link-state.ts";
import {
  clearRegistrySessionCookie,
  loadRegistrySessionCookie,
  saveRegistrySessionCookie,
} from "../registry/session-store.ts";

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

  const { challengeId } = await linkChallenge(registryUrl, signer.did);
  const result = await linkAgent(registryUrl, signer, {
    challengeId,
    hostBaseUrl,
    hostSlug,
  });

  const linkedAtMs = Date.now();
  const state = readLinkState();
  state.currentHost = hostSlug;
  state.links[hostSlug] = { agentDid: signer.did, linkedAtMs };
  writeLinkState(state);

  if (json) {
    console.log(JSON.stringify({ session: true, hostSlug, link: result }, null, 2));
    return;
  }
  console.log(`Linked ${signer.did} to registry account on host ${hostSlug} (${hostBaseUrl})`);
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
    console.log(`${slug}: ${entry.agentDid} (linked ${new Date(entry.linkedAtMs).toISOString()})`);
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

  if (hostSlug === undefined) {
    throw new Error("No host selected. Run khora host use <slug> or pass --host=<slug>.");
  }

  await linkUnlink(registryUrl, { hostBaseUrl, hostSlug });
  clearRegistrySessionCookie();

  const state = readLinkState();
  delete state.links[hostSlug];
  if (state.currentHost === hostSlug) {
    state.currentHost = null;
  }
  if (Object.keys(state.links).length === 0) {
    clearLinkState();
  } else {
    writeLinkState(state);
  }

  if (json) {
    console.log(JSON.stringify({ ok: true, unlinked: true, hostSlug }, null, 2));
    return;
  }
  console.log(`Unlinked registry account for host ${hostSlug} and cleared session.`);
}
