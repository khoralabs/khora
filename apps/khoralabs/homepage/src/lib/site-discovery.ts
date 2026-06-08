import z from "zod";
import { getRegistryUrl } from "./registry-url";

/** khoralabs.com product metadata — not part of the open-source Khora host protocol. */
export const zKhoralabsSiteDiscoverySkill = z.object({
  url: z.string().url(),
  referencesUrl: z.string().url(),
  installScript: z.string().min(1),
});

export type KhoralabsSiteDiscoverySkill = z.infer<typeof zKhoralabsSiteDiscoverySkill>;

export const zKhoralabsSiteDiscoveryAuth = z.object({
  authMd: z.string().url(),
  protectedResourceMetadata: z.string().url(),
  authorizationServerMetadata: z.string().url(),
});

export type KhoralabsSiteDiscoveryAuth = z.infer<typeof zKhoralabsSiteDiscoveryAuth>;

/** HTTP binding: GET /.well-known/khoralabs.json on khoralabs.com */
export const zKhoralabsSiteDiscovery = z.object({
  version: z.literal(1),
  site: z.string().url(),
  registryUrl: z.string().url(),
  skill: zKhoralabsSiteDiscoverySkill,
  auth: zKhoralabsSiteDiscoveryAuth,
  hostDiscoveryNote: z.string(),
});

export type KhoralabsSiteDiscovery = z.infer<typeof zKhoralabsSiteDiscovery>;

const SKILL_BASE = "/downloads/skills/khora-cli";

export function buildSkillInstallScript(origin: string): string {
  return `khora setup
# Or install manually from ${origin.replace(/\/$/, "")}:
mkdir -p .agents/skills/khora-cli/references
curl -fsSL -o .agents/skills/khora-cli/SKILL.md \\
  ${origin.replace(/\/$/, "")}${SKILL_BASE}/SKILL.md
curl -fsSL -o .agents/skills/khora-cli/references/commands.md \\
  ${origin.replace(/\/$/, "")}${SKILL_BASE}/references/commands.md`;
}

export function buildSiteDiscovery(origin: string): KhoralabsSiteDiscovery {
  const site = origin.replace(/\/$/, "");
  const registryUrl = getRegistryUrl();
  const discovery: KhoralabsSiteDiscovery = {
    version: 1,
    site,
    registryUrl,
    skill: {
      url: `${site}${SKILL_BASE}/SKILL.md`,
      referencesUrl: `${site}${SKILL_BASE}/references/commands.md`,
      installScript: buildSkillInstallScript(site),
    },
    auth: {
      authMd: `${site}/auth.md`,
      protectedResourceMetadata: `${registryUrl}/.well-known/oauth-protected-resource`,
      authorizationServerMetadata: `${registryUrl}/.well-known/oauth-authorization-server`,
    },
    hostDiscoveryNote: "GET {host}/.well-known/khora for host registration",
  };
  return zKhoralabsSiteDiscovery.parse(discovery);
}
