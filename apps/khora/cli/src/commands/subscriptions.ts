import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { KhoraPostVisibility, KhoraStandingSearchRequest } from "@khoralabs/khora-contracts";
import {
  authorSubscriptionSearch,
  authorTopicSubscriptionSearch,
  topicSubscriptionSearch,
} from "@khoralabs/khora-contracts";
import { withKhoraClient } from "../flows/context";
import { DEFAULT_NAMESPACE_ROOT } from "../lib/flags";

function visibilityFromFlags(flags: FlagMap): KhoraPostVisibility | undefined {
  const v = strFlag(flags, "visibility")?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("--visibility must be public, network, or private");
}

function requireTitleBody(flags: FlagMap): { title: string; body: string } {
  const title = strFlag(flags, "title")?.trim() ?? "";
  const body = strFlag(flags, "body")?.trim() ?? "";
  if (title.length === 0 || body.length === 0) {
    throw new Error("--title and --body are required");
  }
  return { title, body };
}

async function resolveAuthorProfileId(flags: FlagMap, client: KhoraClient): Promise<string> {
  const profileId = strFlag(flags, "profile-id") ?? strFlag(flags, "profileId");
  if (profileId !== undefined && profileId.trim().length > 0) {
    return profileId.trim();
  }
  const username = strFlag(flags, "username")?.trim();
  if (username !== undefined && username.length > 0) {
    const result = await client.lookupProfileByUsername(username);
    if (result === null) {
      throw new Error(`No profile found for username: ${username}`);
    }
    return result.profile.id;
  }
  throw new Error("--profile-id or --username is required for author subscriptions");
}

export async function handleSubscriptionsList(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
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
}

export async function handleSubscriptionsCreate(
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const json = boolFlag(flags, "json");
  const kind = positional[2];
  if (kind === undefined) {
    throw new Error("Usage: khora subscriptions create <topic|author|author-topic> ...");
  }

  const { title, body } = requireTitleBody(flags);
  const visibility = visibilityFromFlags(flags);

  await withKhoraClient(flags, async (client) => {
    let search: KhoraStandingSearchRequest;
    if (kind === "topic") {
      const slug = strFlag(flags, "slug")?.trim();
      if (slug === undefined || slug.length === 0) {
        throw new Error("--slug is required for topic subscriptions");
      }
      search = topicSubscriptionSearch(slug);
    } else if (kind === "author") {
      const namespaceRoot =
        strFlag(flags, "namespace-root") ??
        strFlag(flags, "namespaceRoot") ??
        DEFAULT_NAMESPACE_ROOT;
      const profileId = await resolveAuthorProfileId(flags, client);
      search = authorSubscriptionSearch(profileId, namespaceRoot);
    } else if (kind === "author-topic") {
      const slug = strFlag(flags, "slug")?.trim();
      if (slug === undefined || slug.length === 0) {
        throw new Error("--slug is required for author-topic subscriptions");
      }
      const namespaceRoot =
        strFlag(flags, "namespace-root") ??
        strFlag(flags, "namespaceRoot") ??
        DEFAULT_NAMESPACE_ROOT;
      const profileId = await resolveAuthorProfileId(flags, client);
      search = authorTopicSubscriptionSearch(profileId, slug, namespaceRoot);
    } else {
      throw new Error(`Unknown subscription kind: ${kind}`);
    }

    const post = await client.createSubscription({
      title,
      body,
      search,
      visibility: visibility ?? "public",
    });
    if (json) {
      console.log(JSON.stringify(post, null, 2));
    } else {
      console.log(`Created subscription ${post.id}`);
    }
  });
}
