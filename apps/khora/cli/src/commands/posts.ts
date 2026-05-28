import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, splitTopics, strFlag } from "@khoralabs/cli-kit";
import type { KhoraPostPatch, KhoraPostVisibility } from "@khoralabs/khora-contracts";

import { readJsonArg, withKhoraClient } from "../flows/context.ts";

function visibilityFromFlags(flags: FlagMap): KhoraPostVisibility | undefined {
  const v = strFlag(flags, "visibility")?.trim();
  if (v === undefined || v.length === 0) return undefined;
  if (v === "public" || v === "network" || v === "private") return v;
  throw new Error("--visibility must be public, network, or private");
}

export async function handlePostsCreate(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const body = strFlag(flags, "body")?.trim();
  if (body === undefined || body.length === 0) {
    throw new Error("--body is required");
  }
  const title = strFlag(flags, "title")?.trim();
  const topics = splitTopics(strFlag(flags, "topics"));
  const visibility = visibilityFromFlags(flags);

  await withKhoraClient(flags, async (client) => {
    const post = await client.createPost({
      body,
      ...(title !== undefined && title.length > 0 ? { title } : {}),
      ...(topics !== undefined ? { topics } : {}),
      visibility: visibility ?? "public",
    });
    if (json) {
      console.log(JSON.stringify(post, null, 2));
    } else {
      console.log(`Created post ${post.id}`);
    }
  });
}

export async function handlePostsGet(positional: string[], flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const postId = positional[2]?.trim();
  if (postId === undefined || postId.length === 0) {
    throw new Error("Usage: khora posts get <postId>");
  }
  await withKhoraClient(flags, async (client) => {
    const post = await client.getPost(postId);
    console.log(JSON.stringify(post, null, json ? 2 : 0));
  });
}

export async function handlePostsDelete(positional: string[], flags: FlagMap): Promise<void> {
  const postId = positional[2]?.trim();
  if (postId === undefined || postId.length === 0) {
    throw new Error("Usage: khora posts delete <postId>");
  }
  await withKhoraClient(flags, async (client) => {
    await client.deletePost(postId);
    console.log(`Deleted post ${postId}`);
  });
}

export async function handlePostsUpdate(positional: string[], flags: FlagMap): Promise<void> {
  const jsonOut = boolFlag(flags, "json");
  const postId = positional[2]?.trim();
  if (postId === undefined || postId.length === 0) {
    throw new Error("Usage: khora posts update <postId> [--body=…] [--title=…] [--json=…]");
  }

  const patchJson = strFlag(flags, "json");
  let patch: Omit<KhoraPostPatch, "authorSignature">;

  if (patchJson !== undefined && patchJson.length > 0) {
    const parsed = readJsonArg(patchJson) as Record<string, unknown>;
    const { authorSignature: _ignored, ...rest } = parsed;
    patch = rest as Omit<KhoraPostPatch, "authorSignature">;
  } else {
    const body = strFlag(flags, "body");
    const title = strFlag(flags, "title");
    const topics = splitTopics(strFlag(flags, "topics"));
    const visibility = visibilityFromFlags(flags);
    if (
      body === undefined &&
      title === undefined &&
      topics === undefined &&
      visibility === undefined
    ) {
      throw new Error("Provide at least one of --body, --title, --topics, --visibility, or --json");
    }
    patch = {
      ...(body !== undefined ? { body } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(topics !== undefined ? { topics } : {}),
      ...(visibility !== undefined ? { visibility } : {}),
    };
  }

  await withKhoraClient(flags, async (client) => {
    const post = await client.updatePost(postId, patch);
    console.log(JSON.stringify(post, null, jsonOut ? 2 : 0));
  });
}
