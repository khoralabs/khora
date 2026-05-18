import * as readline from "node:readline";
import z from "zod";
import type { HostRouteDeps } from "../http/deps.ts";
import { dispatchHttpLikeUnary } from "./unary-dispatch.ts";

const zUnaryIngressWireRequest = z
  .object({
    method: z.string(),
    /** HTTP pathname (`/v1/...`). */
    path: z.string(),
    /** Query string (optional); may omit leading `?`. */
    search: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    /** UTF-8 body for POST/PATCH/DELETE etc. */
    body: z.string().optional(),
    peerIp: z.string().optional(),
  })
  .strict();

export type UnaryIngressWireRequest = z.infer<typeof zUnaryIngressWireRequest>;

/** Parse one NDJSON ingress line (internal tests). */
export function parseUnaryIngressWireLine(line: string): UnaryIngressWireRequest {
  let raw: unknown;
  try {
    raw = JSON.parse(line) as unknown;
  } catch {
    throw new SyntaxError("invalid JSON");
  }
  return zUnaryIngressWireRequest.parse(raw);
}

export async function unaryIngressWireToResponseJson(
  wire: UnaryIngressWireRequest,
  deps: HostRouteDeps,
): Promise<string> {
  const res = await dispatchHttpLikeUnary(
    {
      method: wire.method,
      pathname: wire.path,
      search: wire.search,
      headers: wire.headers ?? {},
      body: wire.body,
      peerIp: wire.peerIp,
    },
    deps,
  );
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const bodyText = await res.text();
  return JSON.stringify({ status: res.status, headers, body: bodyText });
}

function ingressParseErrorLine(message: string): string {
  return JSON.stringify({ error: "ingress_parse_failed", message });
}

/**
 * NDJSON on stdin → JSON status/headers/body lines on stdout.
 * One request object per line; blank lines ignored.
 */
export async function startStdioUnaryIngress(deps: HostRouteDeps): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const wire = parseUnaryIngressWireLine(trimmed);
        const out = await unaryIngressWireToResponseJson(wire, deps);
        process.stdout.write(`${out}\n`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stdout.write(`${ingressParseErrorLine(msg)}\n`);
      }
    }
  } finally {
    rl.close();
  }
}
