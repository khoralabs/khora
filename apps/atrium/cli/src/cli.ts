#!/usr/bin/env bun
import { AtriumClient, AtriumClientError } from "@cfd/atrium-client";
import {
  type AtriumPostPatch,
  zAtriumPostCreate,
  zAtriumPostKind,
  zAtriumPostPatch,
} from "@cfd/atrium-contracts";

type FlagMap = Record<string, string | boolean>;

function parseArgv(argv: string[]): { positional: string[]; flags: FlagMap } {
  const positional: string[] = [];
  const flags: FlagMap = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

function strFlag(flags: FlagMap, key: string): string | undefined {
  const v = flags[key];
  if (v === undefined || v === true) return undefined;
  return String(v);
}

function boolFlag(flags: FlagMap, ...keys: string[]): boolean {
  for (const k of keys) {
    if (flags[k] === true) return true;
  }
  return false;
}

function splitTopics(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function baseUrl(): string {
  return process.env.ATRIUM_BASE_URL?.trim() || "http://127.0.0.1:8787";
}

function requireAgentDid(): string {
  const did = process.env.ATRIUM_AGENT_DID?.trim();
  if (did === undefined || did.length === 0) {
    console.error("Set ATRIUM_AGENT_DID for this command.");
    process.exit(1);
  }
  return did;
}

function patchFromFlags(flags: FlagMap): AtriumPostPatch {
  const patch: AtriumPostPatch = {};
  const body = strFlag(flags, "body");
  const title = strFlag(flags, "title");
  const kind = strFlag(flags, "kind");
  const topics = splitTopics(strFlag(flags, "topics"));
  if (body !== undefined) patch.body = body;
  if (title !== undefined) patch.title = title;
  if (kind !== undefined) patch.kind = zAtriumPostKind.parse(kind);
  if (topics !== undefined) patch.topics = topics;
  return patch;
}

function printHelp(): void {
  console.log(`atrium — CLI for Atrium host (env: ATRIUM_BASE_URL, ATRIUM_AGENT_DID)

Commands:
  health
  register --did <did> [--display-name <name>] [--bio <text>] [--verify]
  inbox list [--limit N] [--mark-read]
  post create --body <text> [--title …] [--topics a,b] [--kind post|probe]
  post update <id> [--body …] [--title …] [--topics a,b] [--kind post|probe]
  post delete <id>
  topic subscribe <slug>
  topic unsubscribe <slug>

Profile id is minted by the host (deterministic per DID). register defaults to skipVerification (local dev). Pass --verify to require DID verification on the host.
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const { positional, flags } = parseArgv(argv);
  const [a, b, c] = positional;
  const client = new AtriumClient({ baseUrl: baseUrl() });

  try {
    if (a === "health") {
      console.log(JSON.stringify(await client.health(), null, 2));
      return;
    }

    if (a === "register") {
      const did = strFlag(flags, "did");
      if (did === undefined || did.length === 0) {
        console.error("register: --did is required");
        process.exit(1);
      }
      const displayName = strFlag(flags, "display-name") ?? strFlag(flags, "displayName");
      const bio = strFlag(flags, "bio");
      const skipVerification = !boolFlag(flags, "verify");
      const metadata: Record<string, unknown> = {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(bio !== undefined ? { bio } : {}),
      };
      const result = await client.register({
        did,
        skipVerification,
        metadata,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (a === "inbox" && b === "list") {
      const did = requireAgentDid();
      const limitRaw = strFlag(flags, "limit");
      const limit = limitRaw !== undefined ? Number.parseInt(limitRaw, 10) : undefined;
      if (limitRaw !== undefined && Number.isNaN(limit)) {
        console.error("inbox list: --limit must be a number");
        process.exit(1);
      }
      const markRead = boolFlag(flags, "mark-read", "markRead");
      const out = await client.listInbox({ did, limit, markRead });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (a === "post" && b === "create") {
      const did = requireAgentDid();
      const body = strFlag(flags, "body");
      if (body === undefined) {
        console.error("post create: --body is required");
        process.exit(1);
      }
      const topics = splitTopics(strFlag(flags, "topics"));
      const raw = {
        body,
        ...(strFlag(flags, "title") !== undefined ? { title: strFlag(flags, "title") } : {}),
        ...(topics !== undefined ? { topics } : {}),
        ...(strFlag(flags, "kind") !== undefined ? { kind: strFlag(flags, "kind") } : {}),
      };
      const createBody = zAtriumPostCreate.parse(raw);
      const post = await client.createPost(did, createBody);
      console.log(JSON.stringify(post, null, 2));
      return;
    }

    if (a === "post" && b === "update") {
      const did = requireAgentDid();
      const id = c;
      if (id === undefined || id.length === 0) {
        console.error("post update: post id required");
        process.exit(1);
      }
      const patch = patchFromFlags(flags);
      zAtriumPostPatch.parse(patch);
      if (Object.keys(patch).length === 0) {
        console.error("post update: pass at least one of --body --title --topics --kind");
        process.exit(1);
      }
      const post = await client.updatePost(did, id, patch);
      console.log(JSON.stringify(post, null, 2));
      return;
    }

    if (a === "post" && b === "delete") {
      const did = requireAgentDid();
      const id = c;
      if (id === undefined || id.length === 0) {
        console.error("post delete: post id required");
        process.exit(1);
      }
      await client.deletePost(did, id);
      return;
    }

    if (a === "topic" && b === "subscribe") {
      const did = requireAgentDid();
      const slug = c;
      if (slug === undefined || slug.length === 0) {
        console.error("topic subscribe: slug required");
        process.exit(1);
      }
      const out = await client.subscribeTopic(did, slug);
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (a === "topic" && b === "unsubscribe") {
      const did = requireAgentDid();
      const slug = c;
      if (slug === undefined || slug.length === 0) {
        console.error("topic unsubscribe: slug required");
        process.exit(1);
      }
      await client.unsubscribeTopic(did, slug);
      return;
    }

    console.error(`Unknown command: ${positional.join(" ")}`);
    printHelp();
    process.exit(1);
  } catch (e) {
    if (e instanceof AtriumClientError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}

await main();
