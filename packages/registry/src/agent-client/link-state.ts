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

export function linkStatePath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "link-state.json");
}

export function readLinkState(): LinkState {
  const p = linkStatePath();
  if (!fs.existsSync(p)) {
    return { links: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as LinkState;
    const links: Record<string, LinkStateEntry> = {};
    for (const [slug, entry] of Object.entries(raw.links ?? {})) {
      if (
        entry !== null &&
        typeof entry === "object" &&
        "agents" in entry &&
        entry.agents !== undefined &&
        typeof entry.agents === "object"
      ) {
        links[slug] = { agents: { ...entry.agents } };
      }
    }
    return {
      currentHost: raw.currentHost ?? null,
      links,
    };
  } catch {
    return { links: {} };
  }
}

export function writeLinkState(state: LinkState): void {
  const p = linkStatePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export function clearLinkState(): void {
  const p = linkStatePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
