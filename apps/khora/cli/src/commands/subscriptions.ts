import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { KhoraPostVisibility, SubscriptionPredicate } from "@khoralabs/khora-contracts";
import { buildSubscriptionSearch } from "@khoralabs/khora-contracts";

import type { KhoraCliContext } from "../flows/context";
import { withKhoraClient } from "../flows/context";
import { runSubscriptionCreateFlow } from "../flows/subscription-flows";
import { exitOnClientError } from "../lib/client-error";
import { DEFAULT_NAMESPACE_ROOT } from "../lib/flags";

function visibilityFromFlags(flags: FlagMap): KhoraPostVisibility | undefined {
  const v = strFlag(flags, "visibility")?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("--visibility must be public, network, or private");
}

function optionalStrFlag(flags: FlagMap, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = strFlag(flags, key)?.trim();
    if (v !== undefined && v.length > 0) return v;
  }
  return undefined;
}

function hasPredicateFlag(flags: FlagMap): boolean {
  return (
    optionalStrFlag(flags, "topic") !== undefined ||
    optionalStrFlag(flags, "author") !== undefined ||
    optionalStrFlag(flags, "query", "q") !== undefined
  );
}

function minScoreFromFlags(flags: FlagMap): number | undefined {
  const raw = strFlag(flags, "min-score") ?? strFlag(flags, "minScore");
  const v = raw?.trim();
  if (v === undefined || v.length === 0) return undefined;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) throw new Error("--min-score must be a number");
  return n;
}

function namespaceRootFromFlags(flags: FlagMap): string {
  return (
    strFlag(flags, "namespace-root")?.trim() ??
    strFlag(flags, "namespaceRoot")?.trim() ??
    DEFAULT_NAMESPACE_ROOT
  );
}

async function resolveAuthorProfileId(client: KhoraClient, author: string): Promise<string> {
  if (author.startsWith("did:")) {
    const result = await client.lookupProfileByDid(author);
    if (result === null) {
      throw new Error(`No profile found for DID: ${author}`);
    }
    return result.profile.id;
  }
  const result = await client.lookupProfileByUsername(author);
  if (result === null) {
    throw new Error(`No profile found for username: ${author}`);
  }
  return result.profile.id;
}

export function formatSubscriptionPredicate(p: SubscriptionPredicate): string {
  const parts: string[] = [];
  if (p.authorDid !== undefined) parts.push(`author:${p.authorDid}`);
  if (p.topicSlug !== undefined) parts.push(`topic:#${p.topicSlug}`);
  if (p.query !== undefined) parts.push(`query:"${p.query}"`);
  return parts.length > 0 ? parts.join(" ") : "(empty)";
}

type SubscriptionCreateParams = {
  topicSlug?: string;
  author?: string;
  queryText?: string;
  body?: string;
  minScore?: number;
  visibility: KhoraPostVisibility;
};

export async function handleSubscriptionsList(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  try {
    await withKhoraClient(flags, async (client) => {
      const snap = await client.listAuthorSubscriptions();
      if (json) {
        console.log(JSON.stringify(snap, null, 2));
        return;
      }
      console.log(`Subscriptions (${snap.subscriptions.length}):`);
      for (const entry of snap.subscriptions) {
        console.log(`  ${entry.id} ${formatSubscriptionPredicate(entry.predicate)}`);
      }
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

export async function handleSubscriptionsCreate(
  ctx: KhoraCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const json = boolFlag(flags, "json");
  if (positional[2] !== undefined) {
    throw new Error(
      `Unknown argument "${positional[2]}". Use flags: khora subscriptions create [--topic=…] [--author=…] [--query=…]`,
    );
  }

  const extraFlags = hasStrFlag(
    flags,
    "slug",
    "username",
    "profile-id",
    "profileId",
    "search-text",
    "searchText",
  );
  if (extraFlags) {
    throw new Error(
      "Removed flags: use --topic, --author, and --query instead of subcommands or --slug/--username/--search-text.",
    );
  }

  let params: SubscriptionCreateParams;

  if (hasPredicateFlag(flags)) {
    const topicSlug = optionalStrFlag(flags, "topic");
    const author = optionalStrFlag(flags, "author");
    const queryText = optionalStrFlag(flags, "query", "q");
    const body = optionalStrFlag(flags, "body");
    if (topicSlug === undefined && author === undefined && queryText === undefined) {
      throw new Error("At least one of --topic, --author, or --query is required.");
    }
    params = {
      ...(topicSlug !== undefined ? { topicSlug } : {}),
      ...(author !== undefined ? { author } : {}),
      ...(queryText !== undefined ? { queryText } : {}),
      ...(body !== undefined ? { body } : {}),
      minScore: minScoreFromFlags(flags),
      visibility: visibilityFromFlags(flags) ?? "public",
    };
  } else if (hasAnyCreateFlag(flags)) {
    throw new Error(
      "Provide --topic, --author, and/or --query together, or omit predicate flags for interactive mode.",
    );
  } else {
    const flow = await runSubscriptionCreateFlow(ctx);
    params = flow;
  }

  try {
    await withKhoraClient(flags, async (client) => {
      const authorProfileId =
        params.author !== undefined
          ? await resolveAuthorProfileId(client, params.author)
          : undefined;

      const search = buildSubscriptionSearch({
        ...(params.topicSlug !== undefined ? { topicSlug: params.topicSlug } : {}),
        ...(authorProfileId !== undefined ? { authorProfileId } : {}),
        ...(params.queryText !== undefined ? { queryText: params.queryText } : {}),
        namespaceRoot: namespaceRootFromFlags(flags),
        minScore: params.minScore,
      });

      const post = await client.createSubscription({
        search,
        visibility: params.visibility,
        ...(params.body !== undefined ? { body: params.body } : {}),
      });

      if (json) {
        console.log(JSON.stringify(post, null, 2));
      } else {
        console.log(`Created subscription ${post.id}`);
      }
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

function hasStrFlag(flags: FlagMap, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = strFlag(flags, key)?.trim();
    if (v !== undefined && v.length > 0) return true;
  }
  return false;
}

function hasAnyCreateFlag(flags: FlagMap): boolean {
  return hasStrFlag(
    flags,
    "topic",
    "author",
    "query",
    "q",
    "body",
    "min-score",
    "minScore",
    "visibility",
    "namespace-root",
    "namespaceRoot",
  );
}
