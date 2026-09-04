import { type KhoraHostDiscovery, zKhoraHostDiscovery } from "@khoralabs/khora-contracts";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import z from "zod";
import { KhoraClientError, type KhoraFetch } from "./transport";

const zDiscoveryVersionProbe = z.object({ version: z.number().int() });

export type DiscoverHostOptions = {
  baseUrl: string;
  fetch?: KhoraFetch;
  /** Expected protocol version; defaults to 1. */
  expectedVersion?: number;
  /** When set, require these feature flags to match the host document exactly. */
  requireFeatures?: {
    search?: boolean;
    invitesRequired?: boolean;
    inbox?: boolean;
  };
};

/**
 * Fetch and validate `GET /.well-known/khora` for a host base URL.
 * Throws {@link KhoraClientError} on HTTP/network failure or protocol mismatch.
 */
export async function discoverHost(opts: DiscoverHostOptions): Promise<KhoraHostDiscovery> {
  const base = opts.baseUrl.trim().replace(/\/$/, "");
  if (base.length === 0) {
    throw new KhoraClientError("discoverHost: baseUrl is required", 400);
  }
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const res = await fetchFn(`${base}${KHORA_HTTP_PATH.wellKnown}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new KhoraClientError(
      `discoverHost: ${res.status} ${res.statusText}`,
      res.status,
      await res.text(),
    );
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new KhoraClientError("discoverHost: invalid JSON", res.status);
  }
  const versionProbe = zDiscoveryVersionProbe.safeParse(json);
  if (!versionProbe.success) {
    throw new KhoraClientError(
      `discoverHost: response shape mismatch: ${versionProbe.error.message}`,
      res.status,
    );
  }
  const expected = opts.expectedVersion ?? 1;
  if (versionProbe.data.version !== expected) {
    throw new KhoraClientError(
      `discoverHost: host protocol v${versionProbe.data.version}, client expects v${expected}`,
      409,
    );
  }
  const parsed = zKhoraHostDiscovery.safeParse(json);
  if (!parsed.success) {
    throw new KhoraClientError(
      `discoverHost: response shape mismatch: ${parsed.error.message}`,
      res.status,
    );
  }
  const doc = parsed.data;
  const required = opts.requireFeatures;
  if (required !== undefined) {
    const features = doc.features;
    if (features === undefined) {
      throw new KhoraClientError(
        "discoverHost: host did not publish features; cannot enforce requireFeatures",
        409,
      );
    }
    for (const key of ["search", "invitesRequired", "inbox"] as const) {
      const want = required[key];
      if (want !== undefined && features[key] !== want) {
        throw new KhoraClientError(
          `discoverHost: host feature '${key}' is ${String(features[key])}, required ${String(want)}`,
          409,
        );
      }
    }
  }
  return doc;
}
