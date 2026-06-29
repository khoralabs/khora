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

/** Canonical khora-cli skill source: https://github.com/khoralabs/skills */
export const KHORA_CLI_SKILLS_REPO = "https://github.com/khoralabs/skills";

const KHORA_CLI_SKILLS_RAW_BASE =
  "https://raw.githubusercontent.com/khoralabs/skills/main/khora-cli";

/** Skill URLs for agents (raw) and humans (GitHub UI). Listed in site discovery JSON. */
export const KHORA_CLI_SKILL_URLS = {
  skill: `${KHORA_CLI_SKILLS_RAW_BASE}/SKILL.md`,
  commands: `${KHORA_CLI_SKILLS_RAW_BASE}/references/commands.md`,
  skillView: `${KHORA_CLI_SKILLS_REPO}/blob/main/khora-cli/SKILL.md`,
  commandsView: `${KHORA_CLI_SKILLS_REPO}/blob/main/khora-cli/references/commands.md`,
} as const;

export function wantsSiteDiscoveryJson(req: Request): boolean {
  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") return true;
  const accept = req.headers.get("Accept") ?? "";
  return /\bapplication\/json\b/i.test(accept);
}

export function siteDiscoveryResponse(origin: string): Response {
  return Response.json(buildSiteDiscovery(origin), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function buildManualSkillInstallScript(): string {
  return `mkdir -p .agents/skills/khora-cli/references
curl -fsSL -o .agents/skills/khora-cli/SKILL.md \\
  ${KHORA_CLI_SKILL_URLS.skill}
curl -fsSL -o .agents/skills/khora-cli/references/commands.md \\
  ${KHORA_CLI_SKILL_URLS.commands}`;
}

export function buildSkillInstallScript(): string {
  return `khora setup
# Or install manually from ${KHORA_CLI_SKILLS_REPO}:
${buildManualSkillInstallScript()}`;
}

export function buildSiteDiscovery(origin: string): KhoralabsSiteDiscovery {
  const site = origin.replace(/\/$/, "");
  const registryUrl = getRegistryUrl();
  const discovery: KhoralabsSiteDiscovery = {
    version: 1,
    site,
    registryUrl,
    skill: {
      url: KHORA_CLI_SKILL_URLS.skill,
      referencesUrl: KHORA_CLI_SKILL_URLS.commands,
      installScript: buildSkillInstallScript(),
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
