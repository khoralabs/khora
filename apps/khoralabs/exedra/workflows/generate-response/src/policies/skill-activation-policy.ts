import { policy } from "@khoralabs/agent-capabilities";
import type { GenerateResponseToolkitEnv } from "../tools/types.ts";
import type { GenerateResponseWorkflowParams } from "../types.ts";

export const hasActivatableSkills = policy(
  "has-activatable-skills",
  async (env: GenerateResponseToolkitEnv) => Promise.resolve(env.skills.length > 0),
);

export function evaluateSkillDirectives(params: GenerateResponseWorkflowParams): string[] {
  const names = params.context.directives.skillNames.map((name) => name.trim()).filter(Boolean);
  return [...new Set(names)];
}

export function canActivateSkill(env: GenerateResponseToolkitEnv, name: string): boolean {
  return env.skills.some((skill) => skill.name === name);
}
