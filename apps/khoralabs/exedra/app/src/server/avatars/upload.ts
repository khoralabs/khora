import { isAllowedAvatarMimeType, MAX_AVATAR_BYTE_SIZE } from "./config.js";
import { avatarExtensionForMimeType } from "./keys.js";
import { deleteAvatarObject, isAvatarStorageConfigured, putAvatarObject } from "./store.js";

export function avatarsUnavailableResponse(): Response {
  return Response.json({ error: "Avatar storage is not configured" }, { status: 503 });
}

export async function parseAvatarUpload(
  req: Request,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; file: File; mimeType: string; bytes: Uint8Array; ext: string; orgId: string | null }
> {
  if (!isAvatarStorageConfigured()) {
    return { ok: false, response: avatarsUnavailableResponse() };
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid multipart form data" }, { status: 400 }),
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, response: Response.json({ error: "Missing file field" }, { status: 400 }) };
  }

  if (file.size === 0) {
    return { ok: false, response: Response.json({ error: "Empty file" }, { status: 400 }) };
  }
  if (file.size > MAX_AVATAR_BYTE_SIZE) {
    return { ok: false, response: Response.json({ error: "File too large" }, { status: 413 }) };
  }

  const mimeType = (file.type || "application/octet-stream").trim();
  if (!isAllowedAvatarMimeType(mimeType)) {
    return {
      ok: false,
      response: Response.json({ error: "Unsupported file type" }, { status: 415 }),
    };
  }

  const orgIdRaw = formData.get("orgId");
  const orgId = typeof orgIdRaw === "string" && orgIdRaw.trim().length > 0 ? orgIdRaw.trim() : null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = avatarExtensionForMimeType(mimeType);
  return { ok: true, file, mimeType, bytes, ext, orgId };
}

export async function replaceAvatarInS3(params: {
  previousS3Key: string | null;
  nextS3Key: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<void> {
  await putAvatarObject({
    s3Key: params.nextS3Key,
    mimeType: params.mimeType,
    bytes: params.bytes,
  });

  if (
    params.previousS3Key !== null &&
    params.previousS3Key.length > 0 &&
    params.previousS3Key !== params.nextS3Key
  ) {
    await deleteAvatarObject(params.previousS3Key);
  }
}

export async function clearAvatarFromS3(s3Key: string | null): Promise<void> {
  if (s3Key === null || s3Key.length === 0) return;
  await deleteAvatarObject(s3Key);
}
