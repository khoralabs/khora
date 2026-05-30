import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Agent DID → linkedAtMs for a host */
export type LinkStateEntry = {
  agents: Record<string, number>;
};

export type LinkState = {
  currentHost?: string | null;
  links: Record<string, LinkStateEntry>;
};

const LEGACY_PATH = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? homedir(),
  ".khora",
  "link.json",
);

export function linkStatePath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "link-state.json");
}

function normalizeEntry(raw: LinkStateEntry | { agentDid?: string; linkedAtMs?: number }): LinkStateEntry {
  if ("agents" in raw && raw.agents !== undefined && typeof raw.agents === "object") {
    return { agents: { ...raw.agents } };
  }
  const legacy = raw as { agentDid?: string; linkedAtMs?: number };
  if (legacy.agentDid !== undefined && legacy.linkedAtMs !== undefined) {
    return { agents: { [legacy.agentDid]: legacy.linkedAtMs } };
  }
  return { agents: {} };
}

function migrateLegacyLinkState(): LinkState | null {
  if (!fs.existsSync(LEGACY_PATH)) return null;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_PATH, "utf8")) as {
      agentDid?: string;
      hostBaseUrl?: string;
      hostSlug?: string | null;
      linkedAtMs?: number;
    };
    if (legacy.agentDid === undefined || legacy.linkedAtMs === undefined) {
      return null;
    }
    const slug = legacy.hostSlug ?? "default";
    return {
      currentHost: legacy.hostSlug ?? null,
      links: {
        [slug]: { agents: { [legacy.agentDid]: legacy.linkedAtMs } },
      },
    };
  } catch {
    return null;
  }
}

export function readLinkState(): LinkState {
  const p = linkStatePath();
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as LinkState & {
        links?: Record<string, LinkStateEntry | { agentDid?: string; linkedAtMs?: number }>;
      };
      const links: Record<string, LinkStateEntry> = {};
      for (const [slug, entry] of Object.entries(raw.links ?? {})) {
        links[slug] = normalizeEntry(entry);
      }
      return {
        currentHost: raw.currentHost ?? null,
        links,
      };
    } catch {
      return { links: {} };
    }
  }
  const migrated = migrateLegacyLinkState();
  if (migrated !== null) {
    writeLinkState(migrated);
    return migrated;
  }
  return { links: {} };
}

export function writeLinkState(state: LinkState): void {
  const p = linkStatePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export function clearLinkState(): void {
  const p = linkStatePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
  if (fs.existsSync(LEGACY_PATH)) fs.unlinkSync(LEGACY_PATH);
}
