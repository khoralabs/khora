import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { canActivateSkill, hasActivatableSkills } from "../policies/index.ts";
import type { SkillRecord } from "../skills/registry.ts";
import type { GenerateResponseToolkitEnv } from "./types.ts";

export type ActivatedSkillContent = {
  name: string;
  alreadyActive: boolean;
  content?: string;
};

export function formatActivatedSkillContent(skill: SkillRecord): string {
  const resources =
    skill.resourceManifest.length > 0
      ? `\n<skill_resources>\n${skill.resourceManifest
          .map((resource) => `  <file>${resource}</file>`)
          .join("\n")}\n</skill_resources>`
      : "";
  return `<skill_content name="${skill.name}">
${skill.body}

Skill directory: ${skill.baseDir}
Relative paths in this skill are relative to the skill directory.${resources}
</skill_content>`;
}

export function activateSkillByName(
  env: GenerateResponseToolkitEnv,
  name: string,
): ActivatedSkillContent {
  const skillName = name.trim();
  if (!canActivateSkill(env, skillName)) {
    throw new Error(`skill is not available for this invocation: ${skillName}`);
  }
  if (env.activatedSkillNames.has(skillName)) {
    return { name: skillName, alreadyActive: true };
  }
  const skill = env.skills.find((item) => item.name === skillName);
  if (skill === undefined) throw new Error(`skill not found: ${skillName}`);
  env.activatedSkillNames.add(skillName);
  return {
    name: skillName,
    alreadyActive: false,
    content: formatActivatedSkillContent(skill),
  };
}

export const activateSkillTool = tool<
  "activateSkill",
  { name: string },
  ActivatedSkillContent,
  GenerateResponseToolkitEnv
>({
  name: "activateSkill",
  description:
    "Load full instructions for an available skill by name. Use this before applying a skill from the available skills catalog.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Name of the skill to activate"),
  }),
  policies: [hasActivatableSkills],
  handler: async (ctx, input) => activateSkillByName(ctx.env, input.name),
});
