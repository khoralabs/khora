import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, splitTopics, strFlag } from "@khoralabs/cli-kit";
import type { KhoraPostPatch, KhoraPostVisibility } from "@khoralabs/khora-contracts";

import type { KhoraCliContext } from "../flows/context";
import { assertInteractiveAllowed, readJsonArg, withKhoraClient } from "../flows/context";
import { runPostCreateInteractiveFlow, runPostUpdateInteractiveFlow } from "../flows/post-flows";
import { exitOnClientError } from "../lib/client-error";
import { mergeTopicLists, parseTopicsFromBody } from "../lib/post-topics";

function visibilityFromFlags(flags: FlagMap): KhoraPostVisibility | undefined {
  const v = strFlag(flags, "visibility")?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("--visibility must be public, network, or private");
}

export async function handlePostsCreate(ctx: KhoraCliContext, flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const body = strFlag(flags, "body")?.trim();
  if (body === undefined || body.length === 0) {
    assertInteractiveAllowed("Pass --body to create a post non-interactively.");
  }
  const createBody =
    body === undefined || body.length === 0
      ? await runPostCreateInteractiveFlow(ctx)
      : (() => {
          const topics = mergeTopicLists(
            parseTopicsFromBody(body),
            splitTopics(strFlag(flags, "topics")),
          );
          return {
            body,
            ...(strFlag(flags, "title")?.trim() ? { title: strFlag(flags, "title")?.trim() } : {}),
            ...(topics !== undefined ? { topics } : {}),
            visibility: visibilityFromFlags(flags) ?? "public",
          };
        })();

  try {
    await withKhoraClient(flags, async (client) => {
      const post = await client.createPost(createBody);
      if (json) {
        console.log(JSON.stringify(post, null, 2));
      } else {
        console.log(`Created post ${post.id}`);
      }
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}

export async function handlePostsGet(_positional: string[], flags: FlagMap): Promise<void> {
  const pretty = boolFlag(flags, "pretty");
  const postId = _positional[2]?.trim();
  if (postId === undefined || postId.length === 0) {
    throw new Error("Usage: khora posts get <postId> [--pretty]");
  }
  await withKhoraClient(flags, async (client) => {
    const post = await client.getPost(postId);
    console.log(JSON.stringify(post, null, pretty ? 2 : 0));
  });
}

export async function handlePostsDelete(_positional: string[], flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const postId = _positional[2]?.trim();
  if (postId === undefined || postId.length === 0) {
    throw new Error("Usage: khora posts delete <postId> [--json]");
  }
  await withKhoraClient(flags, async (client) => {
    await client.deletePost(postId);
    if (json) {
      console.log(JSON.stringify({ ok: true, postId }, null, 2));
    } else {
      console.log(`Deleted post ${postId}`);
    }
  });
}

export async function handlePostsUpdate(
  ctx: KhoraCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const json = boolFlag(flags, "json");
  const pretty = boolFlag(flags, "pretty");
  const postId = positional[2]?.trim();
  if (postId === undefined || postId.length === 0) {
    throw new Error("Usage: khora posts update <postId> [--body=…] [--patch=…]");
  }

  const patchRaw = strFlag(flags, "patch");
  let patch: Omit<KhoraPostPatch, "authorSignature">;

  if (patchRaw !== undefined && patchRaw.length > 0) {
    const parsed = readJsonArg(patchRaw) as Record<string, unknown>;
    const { authorSignature: _ignored, ...rest } = parsed;
    patch = rest as Omit<KhoraPostPatch, "authorSignature">;
  } else {
    const body = strFlag(flags, "body");
    const title = strFlag(flags, "title");
    const bodyTopics =
      body !== undefined && body.trim().length > 0 ? parseTopicsFromBody(body) : [];
    const topics = mergeTopicLists(
      bodyTopics.length > 0 ? bodyTopics : undefined,
      splitTopics(strFlag(flags, "topics")),
    );
    const visibility = visibilityFromFlags(flags);
    if (
      body === undefined &&
      title === undefined &&
      topics === undefined &&
      visibility === undefined
    ) {
      assertInteractiveAllowed(
        "Pass --body, --title, --topics, or --visibility to update a post non-interactively.",
      );
      patch = await runPostUpdateInteractiveFlow(ctx);
    } else {
      patch = {
        ...(body !== undefined ? { body } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(topics !== undefined ? { topics } : {}),
        ...(visibility !== undefined ? { visibility } : {}),
      };
    }
  }

  try {
    await withKhoraClient(flags, async (client) => {
      const post = await client.updatePost(postId, patch);
      const indent = json || pretty ? 2 : 0;
      console.log(JSON.stringify(post, null, indent));
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}
