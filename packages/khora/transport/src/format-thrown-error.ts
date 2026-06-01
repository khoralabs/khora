const OPAQUE_OBJECT_RE = /^\[object .+\]$/;

function isOpaqueObjectString(s: string): boolean {
  return OPAQUE_OBJECT_RE.test(s.trim());
}

function stringFromPrimitive(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !isOpaqueObjectString(trimmed)) return trimmed;
    return undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function eventLikeMessage(value: unknown, depth: number): string | undefined {
  if (depth > 4 || value === null || typeof value !== "object") {
    return undefined;
  }

  if (value instanceof Error) {
    return formatThrownErrorInner(value, depth + 1);
  }

  const primitive = stringFromPrimitive(value);
  if (primitive !== undefined) return primitive;

  if ("message" in value) {
    const nested = formatThrownErrorInner((value as { message: unknown }).message, depth + 1);
    if (nested !== "Unexpected error") return nested;
  }
  if ("error" in value) {
    const nested = formatThrownErrorInner((value as { error: unknown }).error, depth + 1);
    if (nested !== "Unexpected error") return nested;
  }
  if ("type" in value) {
    const type = stringFromPrimitive((value as { type: unknown }).type);
    if (type !== undefined) return `Network error (${type})`;
  }

  const ctorName = (value as { constructor?: { name?: unknown } }).constructor?.name;
  if (typeof ctorName === "string") {
    const name = ctorName.trim();
    if (name.length > 0 && name !== "Object") {
      return `Network error (${name})`;
    }
  }

  return undefined;
}

function errorCode(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || !("code" in value)) {
    return undefined;
  }
  return stringFromPrimitive((value as { code: unknown }).code);
}

function isKhoraClientError(e: unknown): e is Error & { status: number } {
  return (
    e instanceof Error &&
    e.name === "KhoraClientError" &&
    typeof (e as { status?: unknown }).status === "number"
  );
}

function formatThrownErrorInner(e: unknown, depth = 0): string {
  if (isKhoraClientError(e)) {
    const msg = e.message.trim();
    if (msg.length > 0 && !isOpaqueObjectString(msg)) return msg;
    return `Host error (${e.status})`;
  }

  if (e instanceof Error) {
    const msg = e.message.trim();
    if (msg.length > 0 && !isOpaqueObjectString(msg)) return msg;

    if ("cause" in e && e.cause !== undefined) {
      const fromCause = formatThrownErrorInner(e.cause, depth + 1);
      if (fromCause !== "Unexpected error") return fromCause;
    }

    const code = errorCode(e);
    if (code !== undefined) return `Network request failed (${code})`;

    const eventLike = eventLikeMessage(e, depth);
    if (eventLike !== undefined) return eventLike;

    if (isOpaqueObjectString(msg)) return "Network request failed";
    return "Unexpected error";
  }

  const primitive = stringFromPrimitive(e);
  if (primitive !== undefined) return primitive;

  const eventLike = eventLikeMessage(e, depth);
  if (eventLike !== undefined) return eventLike;

  const code = errorCode(e);
  if (code !== undefined) return `Network request failed (${code})`;

  const fallback = stringFromPrimitive(String(e ?? ""));
  if (fallback !== undefined && !isOpaqueObjectString(fallback)) return fallback;

  return "Unexpected error";
}

/** Human-readable message for unknown thrown values (fetch failures, ErrorEvent, etc.). */
export function formatThrownError(e: unknown): string {
  return formatThrownErrorInner(e);
}
