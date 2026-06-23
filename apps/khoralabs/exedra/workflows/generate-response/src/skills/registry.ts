export type SkillRecord = {
  name: string;
  description: string;
  location: string;
  baseDir: string;
  body: string;
  bodyHash: string;
  resourceManifest: string[];
  resourceManifestHash: string;
};

export type SkillCatalogEntry = Pick<
  SkillRecord,
  "name" | "description" | "location" | "bodyHash" | "resourceManifestHash"
>;

const bundledSkillDirs = [
  "conduct-interview",
  "facilitate-conversation",
  "summarize-thread",
] as const;

let cachedSkills: SkillRecord[] | undefined;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function sha256Hex(input: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

function parseFrontmatter(
  content: string,
  location: string,
): {
  name: string;
  description: string;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`skill is missing frontmatter: ${location}`);
  const frontmatter = match[1];
  const body = match[2].trim();
  const metadata: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();
    metadata[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  const name = metadata.name?.trim();
  const description = metadata.description?.trim();
  if (!name) throw new Error(`skill is missing name: ${location}`);
  if (!description) throw new Error(`skill is missing description: ${location}`);
  return { name, description, body };
}

async function loadBundledSkill(dir: string): Promise<SkillRecord> {
  const skillUrl = new URL(`./${dir}/SKILL.md`, import.meta.url);
  const content = await Bun.file(skillUrl).text();
  const location = skillUrl.pathname;
  const baseDir = new URL(`./${dir}/`, import.meta.url).pathname;
  const parsed = parseFrontmatter(content, location);
  const resourceManifest: string[] = [];
  return {
    ...parsed,
    location,
    baseDir,
    bodyHash: sha256Hex(parsed.body),
    resourceManifest,
    resourceManifestHash: sha256Hex(stableStringify(resourceManifest)),
  };
}

export async function discoverBundledSkills(): Promise<SkillRecord[]> {
  cachedSkills ??= await Promise.all(bundledSkillDirs.map((dir) => loadBundledSkill(dir)));
  return cachedSkills;
}

export async function getSkillByName(name: string): Promise<SkillRecord | undefined> {
  const skills = await discoverBundledSkills();
  return skills.find((skill) => skill.name === name);
}

export function skillCatalog(skills: SkillRecord[]): SkillCatalogEntry[] {
  return skills.map(({ name, description, location, bodyHash, resourceManifestHash }) => ({
    name,
    description,
    location,
    bodyHash,
    resourceManifestHash,
  }));
}

export function formatSkillCatalog(skills: SkillRecord[]): string {
  if (skills.length === 0) return "";
  const entries = skillCatalog(skills)
    .map(
      (skill) =>
        `<skill><name>${skill.name}</name><description>${skill.description}</description><location>${skill.location}</location></skill>`,
    )
    .join("\n");
  return `<available_skills>\n${entries}\n</available_skills>`;
}

export function selectSkillsByName(skills: SkillRecord[], names: string[]): SkillRecord[] {
  const selected: SkillRecord[] = [];
  for (const name of names) {
    const skill = skills.find((item) => item.name === name);
    if (skill === undefined) throw new Error(`unknown skill directive: ${name}`);
    if (!selected.some((item) => item.name === skill.name)) selected.push(skill);
  }
  return selected;
}

export function skillStaticManifest(skills: SkillRecord[]): string {
  return stableStringify(
    skillCatalog(skills).map((skill) => ({
      name: skill.name,
      description: skill.description,
      bodyHash: skill.bodyHash,
      resourceManifestHash: skill.resourceManifestHash,
    })),
  );
}
