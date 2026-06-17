import { requireRegistrySessionResponse } from "../auth/require-session.js";
import { getDb } from "../db/index.js";
import { getOrg, getTeam, userBelongsToOrg } from "../db/membership.js";
import { isTeamMember } from "../db/sessions.js";
import { findUserById } from "../identity/users.js";
import type { AvatarKind } from "./urls.js";

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function requireAvatarAccess(
  req: Request,
  kind: AvatarKind,
  id: string,
): Promise<{ ok: false; response: Response } | { ok: true; userId: string }> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { ok: false, response: auth.response };

  const db = getDb();
  const { getOrCreateUser } = await import("../identity/users.js");
  const user = await getOrCreateUser(db, auth.session.user.id);

  if (kind === "user") {
    if (user.id !== id) {
      return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
    }
    return { ok: true, userId: user.id };
  }

  if (kind === "org") {
    if (!userBelongsToOrg(db, id, user.id)) {
      return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
    }
    return { ok: true, userId: user.id };
  }

  if (kind === "team") {
    if (!isTeamMember(db, id, user.id)) {
      return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
    }
    return { ok: true, userId: user.id };
  }

  return { ok: false, response: jsonResponse({ error: "Invalid avatar kind" }, 400) };
}

export function resolveAvatarS3Key(kind: AvatarKind, id: string): string | null {
  const db = getDb();
  if (kind === "user") {
    return findUserById(db, id)?.avatarS3Key ?? null;
  }
  if (kind === "org") {
    return getOrg(db, id)?.avatarS3Key ?? null;
  }
  if (kind === "team") {
    return getTeam(db, id)?.avatarS3Key ?? null;
  }
  return null;
}

export async function handleServeAvatar(req: Request, kind: string, id: string): Promise<Response> {
  if (kind !== "user" && kind !== "org" && kind !== "team") {
    return jsonResponse({ error: "Invalid avatar kind" }, 400);
  }

  const access = await requireAvatarAccess(req, kind, id);
  if (!access.ok) return access.response;

  const s3Key = resolveAvatarS3Key(kind, id);
  if (s3Key === null || s3Key.length === 0) {
    return jsonResponse({ error: "Avatar not found" }, 404);
  }

  const { isAvatarStorageConfigured, getAvatarObject } = await import("./store.js");
  if (!isAvatarStorageConfigured()) {
    return jsonResponse({ error: "Avatar storage is not configured" }, 503);
  }

  try {
    const { bytes, contentType } = await getAvatarObject(s3Key);
    const body = Uint8Array.from(bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return jsonResponse({ error: "Avatar not found" }, 404);
  }
}
