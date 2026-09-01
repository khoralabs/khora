import type { PersistableSigner } from "@khoralabs/did-key-identity";
import { KhoraClient } from "./khora-client";

export type DiscoverHostClient = {
  lookupProfileByDid(did: string): Promise<unknown | null>;
  dispose(): void;
};

export type DiscoverRegisteredHostSlugsDeps = {
  createClient?: (baseUrl: string, signer: PersistableSigner) => DiscoverHostClient;
};

/**
 * Probe configured host base URLs and return slugs where this DID has a profile.
 * Used after registry link to propagate across known hosts.
 */
export async function discoverRegisteredHostSlugs(
  signer: PersistableSigner,
  hosts: Record<string, { baseUrl: string }>,
  excludeSlug?: string,
  deps?: DiscoverRegisteredHostSlugsDeps,
): Promise<string[]> {
  const createClient =
    deps?.createClient ??
    ((baseUrl: string, s: PersistableSigner) => new KhoraClient({ baseUrl, signer: s }));
  const slugs: string[] = [];
  for (const [slug, entry] of Object.entries(hosts)) {
    if (excludeSlug !== undefined && slug === excludeSlug) continue;
    const client = createClient(entry.baseUrl, signer);
    try {
      const result = await client.lookupProfileByDid(signer.did);
      if (result !== null) {
        slugs.push(slug);
      }
    } catch {
      /* host unreachable or not registered */
    } finally {
      client.dispose();
    }
  }
  return slugs;
}
