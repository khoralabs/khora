import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError } from "ai";

const MAX_PROVIDER_BODY_CHARS = 16_000;

function stringifyProviderBody(body: unknown): string {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function truncateForLog(s: string, max = MAX_PROVIDER_BODY_CHARS): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}\n… (${s.length - max} more characters truncated)`;
}

/**
 * Human-readable chain for AI SDK / provider failures (exposes HTTP status and
 * response body when present). Walks `.cause` recursively up to depth 8.
 */
export function formatNegotiationProviderError(e: unknown): string {
  const lines: string[] = [];

  function appendFromUnknown(cur: unknown, depth: number): void {
    if (cur === undefined || depth > 8) {
      return;
    }
    if (cur instanceof APICallError) {
      lines.push(`${cur.name}: ${cur.message}`);
      if (cur.statusCode !== undefined) {
        lines.push(`HTTP ${cur.statusCode}`);
      }
      if (cur.url) {
        lines.push(`URL: ${cur.url}`);
      }
      const bodyText = stringifyProviderBody(cur.responseBody);
      if (bodyText) {
        lines.push(`Response body:\n${truncateForLog(bodyText)}`);
      }
      const hdrs = cur.responseHeaders;
      if (hdrs !== undefined && typeof hdrs === "object" && Object.keys(hdrs).length > 0) {
        lines.push(`Response headers: ${truncateForLog(JSON.stringify(hdrs), 4000)}`);
      }
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    if (NoOutputGeneratedError.isInstance(cur)) {
      lines.push(`${cur.name}: ${cur.message}`);
      lines.push(
        "Source: AI SDK (not a raw provider HTTP error). The model/tool loop ended without producing the structured negotiation object — e.g. used all tool steps without a final JSON object, empty completion, safety stop, or object-generation gave up.",
      );
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    if (NoObjectGeneratedError.isInstance(cur)) {
      lines.push(`${cur.name}: ${cur.message}`);
      lines.push(
        "Source: AI SDK. The model returned something that could not be parsed into the expected structured JSON object.",
      );
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    if (cur instanceof Error) {
      lines.push(`${cur.name}: ${cur.message}`);
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    lines.push(typeof cur === "object" ? JSON.stringify(cur) : String(cur));
  }

  appendFromUnknown(e, 0);
  return lines.filter(Boolean).join("\n");
}
