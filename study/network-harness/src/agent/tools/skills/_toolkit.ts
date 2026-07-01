import { toolkit } from "@khoralabs/agent-capabilities";

import { activateSkillTool } from "./activate-skill.ts";
import { writeSkillTool } from "./write-skill.ts";

export const skillsToolkit = toolkit([writeSkillTool, activateSkillTool], {
  name: "skills",
  instructions: [
    "Use writeSkill to author skills in the skills namespace (alias for a structured memory write).",
    "Use activateSkill to load specialized instructions from skills stored in the skills namespace.",
  ],
});
