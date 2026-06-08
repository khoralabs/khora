import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag, style } from "@khoralabs/cli-kit";
import { cliBaseUrl, cliCurrentHostSlug, loadSigner } from "../flows/context";
import { khoraCliResolvedConfig } from "../khora-app-config";
import {
  clearAgentAuthPending,
  readAgentAuthPending,
  writeAgentAuthPending,
} from "../registry/agent-auth-pending";
import {
  agentAuthComplete,
  agentAuthRegister,
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

async function promptOtp(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "OTP required. Re-run with --otp=<code> after the user receives the email code.",
    );
  }
  const rl = readline.createInterface({ input, output });
  try {
    const code = (await rl.question("Enter the 6-digit code from email: ")).trim();
    if (code.length === 0) {
      throw new Error("OTP required");
    }
    return code;
  } finally {
    rl.close();
  }
}

async function establishRegistrySession(
  registryUrl: string,
  flags: FlagMap,
  json: boolean,
  noOpen: boolean,
): Promise<void> {
  const email = strFlag(flags, "email")?.trim();
  const otp = strFlag(flags, "otp")?.trim();

  if (email !== undefined && email.length > 0) {
    if (otp !== undefined && otp.length > 0) {
      const pending = readAgentAuthPending();
      const sessionCookie = await agentAuthComplete(registryUrl, {
        otp,
        email,
        ...(pending !== null && pending.email === email ? { claimToken: pending.claimToken } : {}),
      });
      saveRegistrySessionCookie(sessionCookie);
      clearAgentAuthPending();
      return;
    }

    const registered = await agentAuthRegister(registryUrl, email);
    writeAgentAuthPending({
      email,
      claimToken: registered.claim_token,
      registrationId: registered.registration_id,
      createdAtMs: Date.now(),
    });
    if (!json) {
      console.log(`OTP sent to ${email}. Enter the code to finish linking.`);
    }
    const code = await promptOtp();
    const sessionCookie = await agentAuthComplete(registryUrl, {
      email,
      claimToken: registered.claim_token,
      otp: code,
    });
    saveRegistrySessionCookie(sessionCookie);
    clearAgentAuthPending();
    return;
  }

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
}

async function completeAgentLink(
  registryUrl: string,
  flags: FlagMap,
  json: boolean,
): Promise<void> {
  const hostBaseUrl = cliBaseUrl(flags);
  const hostSlug = cliCurrentHostSlug(flags);
  if (hostSlug === undefined) {
    throw new Error(
      "No host selected. Run khora host use <slug> or pass --host=<slug> before khora link.",
    );
  }

  const signer = await loadSigner(flags);

  const sessionCheck = await linkStatus(registryUrl);
  if (sessionCheck === null) {
    clearRegistrySessionCookie();
    throw new Error(
      "Registry session could not be verified. Run khora link again and complete sign-in.",
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

export async function handleLink(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const noOpen = boolFlag(flags, "no-open");
  const registryUrl = cliRegistryUrl(flags);
  const email = strFlag(flags, "email")?.trim();
  const otp = strFlag(flags, "otp")?.trim();

  if (email !== undefined && email.length > 0 && otp !== undefined && otp.length > 0) {
    await establishRegistrySession(registryUrl, flags, json, noOpen);
    await completeAgentLink(registryUrl, flags, json);
    return;
  }

  if (email !== undefined && email.length > 0) {
    await establishRegistrySession(registryUrl, flags, json, noOpen);
    await completeAgentLink(registryUrl, flags, json);
    return;
  }

  await establishRegistrySession(registryUrl, flags, json, noOpen);
  await completeAgentLink(registryUrl, flags, json);
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
    const remoteLinks = (remote as { links?: unknown[] }).links;
    if (Array.isArray(remoteLinks) && remoteLinks.length > 0) {
      for (const link of remoteLinks) {
        if (typeof link === "object" && link !== null) {
          const row = link as {
            hostSlug?: string | null;
            agentDid?: string;
            linkedAtMs?: number;
          };
          const slug = row.hostSlug ?? "?";
          const did = row.agentDid ?? "?";
          const at =
            row.linkedAtMs !== undefined ? new Date(row.linkedAtMs).toISOString() : "unknown time";
          console.log(`  remote ${slug}: ${did} (linked ${at})`);
        }
      }
    } else {
      console.log("  remote: session valid, no agent links");
    }
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
  clearAgentAuthPending();

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
