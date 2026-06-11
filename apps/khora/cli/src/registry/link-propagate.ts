import type { PersistableRelaySigner } from "@khoralabs/agent-persisted-signer";
import { KhoraClient } from "@khoralabs/khora-client";

export async function discoverRegisteredHostSlugs(
  signer: PersistableRelaySigner,
  hosts: Record<string, { baseUrl: string }>,
  excludeSlug?: string,
): Promise<string[]> {
  const slugs: string[] = [];
  for (const [slug, entry] of Object.entries(hosts)) {
    if (excludeSlug !== undefined && slug === excludeSlug) continue;
    const client = new KhoraClient({ baseUrl: entry.baseUrl, signer });
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
