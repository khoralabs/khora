import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

export const SKILLS_NAMESPACE = "skills";

export type SkillRecord = {
  name: string;
  description: string;
  body: string;
  namespace: string;
  key: string;
};

export function formatSkillDocument(name: string, description: string, body: string): string {
  return `---\nname: ${name.trim()}\ndescription: ${description.trim()}\n---\n\n${body.trim()}`;
}

export function defaultSkillKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontmatter(
  content: string,
  location: string,
): Omit<SkillRecord, "namespace" | "key"> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`skill is missing frontmatter: ${location}`);
  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
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
  return { name, description, body: match[2].trim() };
}

export function skillRecordFromText(namespace: string, key: string, text: string): SkillRecord {
  const parsed = parseFrontmatter(text, `${namespace}/${key}`);
  return { ...parsed, namespace, key };
}

export function formatSkillCatalog(skills: SkillRecord[]): string {
  if (skills.length === 0) return "";
  const entries = skills
    .map(
      (skill) =>
        `<skill><name>${skill.name}</name><description>${skill.description}</description><namespace>${skill.namespace}</namespace></skill>`,
    )
    .join("\n");
  return `<available_skills>\n${entries}\n</available_skills>`;
}

export function formatActivatedSkillContent(skill: SkillRecord): string {
  return `<skill_content name="${skill.name}">
${skill.body}

Skill namespace: ${skill.namespace}
Skill key: ${skill.key}
</skill_content>`;
}

export async function loadSkillByKey(
  client: RemoteMemoriesClientAsync,
  key: string,
): Promise<SkillRecord | undefined> {
  const memoryId = await client.persistence.findMemoryIdByKey(SKILLS_NAMESPACE, key);
  if (memoryId === undefined) return undefined;

  const hits = await client.search({
    namespace: SKILLS_NAMESPACE,
    content: { text: key },
    options: { topK: 8, neighbors: "off", arms: { lexical: 1, vector: 0 } },
  });
  const hit = hits.find((candidate) => candidate.memory.key === key);
  if (hit === undefined) return undefined;
  const text = await client.persistence.getSourceMapTextPreview(hit.id, 100_000);
  if (text === null || text.length === 0) return undefined;
  return skillRecordFromText(SKILLS_NAMESPACE, key, text);
}

export async function discoverSkillsFromMemories(
  client: RemoteMemoriesClientAsync,
): Promise<SkillRecord[]> {
  const hits = await client.search({
    namespace: SKILLS_NAMESPACE,
    content: { text: "skill" },
    options: { topK: 100, neighbors: "off", arms: { lexical: 1, vector: 0 } },
  });

  const byKey = new Map<string, SkillRecord>();
  for (const hit of hits) {
    const key = hit.memory.key;
    if (byKey.has(key)) continue;
    const text = await client.persistence.getSourceMapTextPreview(hit.id, 100_000);
    if (text === null || text.length === 0) continue;
    try {
      byKey.set(key, skillRecordFromText(SKILLS_NAMESPACE, key, text));
    } catch {}
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
