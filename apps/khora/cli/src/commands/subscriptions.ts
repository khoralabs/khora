import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { KhoraPostVisibility, KhoraStandingSearchRequest } from "@khoralabs/khora-contracts";
import {
  authorSubscriptionSearch,
  authorTopicSubscriptionSearch,
  topicSubscriptionSearch,
} from "@khoralabs/khora-contracts";

import type { KhoraCliContext } from "../flows/context";
import { withKhoraClient } from "../flows/context";
import {
  runSubscriptionAuthorCreateFlow,
  runSubscriptionAuthorTopicCreateFlow,
  runSubscriptionTopicCreateFlow,
} from "../flows/subscription-flows";
import { exitOnClientError } from "../lib/client-error";
import { DEFAULT_NAMESPACE_ROOT } from "../lib/flags";

function visibilityFromFlags(flags: FlagMap): KhoraPostVisibility | undefined {
  const v = strFlag(flags, "visibility")?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("--visibility must be public, network, or private");
}

function hasStrFlag(flags: FlagMap, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = strFlag(flags, key)?.trim();
    if (v !== undefined && v.length > 0) return true;
  }
  return false;
}

function requireStrFlag(flags: FlagMap, ...keys: string[]): string {
  for (const key of keys) {
    const v = strFlag(flags, key)?.trim();
    if (v !== undefined && v.length > 0) return v;
  }
  throw new Error(`Missing required flag: ${keys.join(" or ")}`);
}

function namespaceRootFromFlags(flags: FlagMap): string {
  return (
    strFlag(flags, "namespace-root")?.trim() ??
    strFlag(flags, "namespaceRoot")?.trim() ??
    DEFAULT_NAMESPACE_ROOT
  );
}

async function resolveAuthorProfileIdByUsername(
  client: KhoraClient,
  username: string,
): Promise<string> {
  const result = await client.lookupProfileByUsername(username);
  if (result === null) {
    throw new Error(`No profile found for username: ${username}`);
  }
  return result.profile.id;
}

function requireUsername(username: string | undefined): string {
  if (username === undefined || username.length === 0) {
    throw new Error("Username is required.");
  }
  return username;
}

function partialFlagsError(kind: string): never {
  throw new Error(
    `Provide all required flags for ${kind} subscriptions, or omit them for interactive mode.`,
  );
}

type SubscriptionCreateInput = {
  title: string;
  body: string;
  search: KhoraStandingSearchRequest;
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
      console.log(`Authors (${snap.authorDids.length}):`);
      for (const did of snap.authorDids) {
        console.log(`  ${did}`);
      }
      console.log(`Author topics (${snap.authorTopics.length}):`);
      for (const t of snap.authorTopics) {
        console.log(`  ${t.authorDid} / ${t.topicSlug}`);
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
  const kind = positional[2];
  if (kind === undefined) {
    throw new Error("Usage: khora subscriptions create <topic|author|author-topic> ...");
  }

  const topicPartial = hasStrFlag(flags, "slug", "title", "body", "visibility");
  const topicComplete = hasStrFlag(flags, "slug", "title", "body");

  const authorPartial = hasStrFlag(
    flags,
    "profile-id",
    "profileId",
    "username",
    "title",
    "body",
    "visibility",
    "namespace-root",
    "namespaceRoot",
  );
  const authorComplete =
    (hasStrFlag(flags, "profile-id", "profileId") || hasStrFlag(flags, "username")) &&
    hasStrFlag(flags, "title", "body");

  const authorTopicPartial = hasStrFlag(
    flags,
    "slug",
    "profile-id",
    "profileId",
    "username",
    "title",
    "body",
    "visibility",
    "namespace-root",
    "namespaceRoot",
  );
  const authorTopicComplete = hasStrFlag(flags, "slug") && authorComplete;

  let prepared:
    | { mode: "topic"; slug: string; title: string; body: string; visibility: KhoraPostVisibility }
    | {
        mode: "author";
        profileId?: string;
        username?: string;
        title: string;
        body: string;
        visibility: KhoraPostVisibility;
      }
    | {
        mode: "author-topic";
        slug: string;
        profileId?: string;
        username?: string;
        title: string;
        body: string;
        visibility: KhoraPostVisibility;
      };

  if (kind === "topic") {
    if (topicComplete) {
      prepared = {
        mode: "topic",
        slug: requireStrFlag(flags, "slug"),
        title: requireStrFlag(flags, "title"),
        body: requireStrFlag(flags, "body"),
        visibility: visibilityFromFlags(flags) ?? "public",
      };
    } else if (topicPartial) {
      partialFlagsError("topic");
    } else {
      const flow = await runSubscriptionTopicCreateFlow(ctx);
      prepared = { mode: "topic", ...flow };
    }
  } else if (kind === "author") {
    if (authorComplete) {
      prepared = {
        mode: "author",
        title: requireStrFlag(flags, "title"),
        body: requireStrFlag(flags, "body"),
        visibility: visibilityFromFlags(flags) ?? "public",
        ...(hasStrFlag(flags, "profile-id", "profileId")
          ? { profileId: requireStrFlag(flags, "profile-id", "profileId") }
          : { username: requireStrFlag(flags, "username") }),
      };
    } else if (authorPartial) {
      partialFlagsError("author");
    } else {
      const flow = await runSubscriptionAuthorCreateFlow(ctx);
      prepared = { mode: "author", ...flow };
    }
  } else if (kind === "author-topic") {
    if (authorTopicComplete) {
      prepared = {
        mode: "author-topic",
        slug: requireStrFlag(flags, "slug"),
        title: requireStrFlag(flags, "title"),
        body: requireStrFlag(flags, "body"),
        visibility: visibilityFromFlags(flags) ?? "public",
        ...(hasStrFlag(flags, "profile-id", "profileId")
          ? { profileId: requireStrFlag(flags, "profile-id", "profileId") }
          : { username: requireStrFlag(flags, "username") }),
      };
    } else if (authorTopicPartial) {
      partialFlagsError("author-topic");
    } else {
      const flow = await runSubscriptionAuthorTopicCreateFlow(ctx);
      prepared = { mode: "author-topic", ...flow };
    }
  } else {
    throw new Error(`Unknown subscription kind: ${kind}`);
  }

  try {
    await withKhoraClient(flags, async (client) => {
      let input: SubscriptionCreateInput;
      const namespaceRoot = namespaceRootFromFlags(flags);

      if (prepared.mode === "topic") {
        input = {
          title: prepared.title,
          body: prepared.body,
          visibility: prepared.visibility,
          search: topicSubscriptionSearch(prepared.slug),
        };
      } else if (prepared.mode === "author") {
        const profileId =
          prepared.profileId ??
          (await resolveAuthorProfileIdByUsername(client, requireUsername(prepared.username)));
        input = {
          title: prepared.title,
          body: prepared.body,
          visibility: prepared.visibility,
          search: authorSubscriptionSearch(profileId, namespaceRoot),
        };
      } else {
        const profileId =
          prepared.profileId ??
          (await resolveAuthorProfileIdByUsername(client, requireUsername(prepared.username)));
        input = {
          title: prepared.title,
          body: prepared.body,
          visibility: prepared.visibility,
          search: authorTopicSubscriptionSearch(profileId, prepared.slug, namespaceRoot),
        };
      }

      const post = await client.createSubscription(input);
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
