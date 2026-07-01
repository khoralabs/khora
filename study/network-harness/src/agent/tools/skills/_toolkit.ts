import { toolkit } from "@khoralabs/agent-capabilities";

import { activateSkillTool } from "./activate-skill.ts";
import { readSkillLinesTool } from "./read-skill-lines.ts";
import { replaceSkillLinesTool } from "./replace-skill-lines.ts";
import { writeSkillTool } from "./write-skill.ts";

export const skillsToolkit = toolkit(
  [writeSkillTool, readSkillLinesTool, replaceSkillLinesTool, activateSkillTool],
  {
    name: "skills",
    instructions: [
      "Use writeSkill to author new skills in the skills namespace.",
      "Use readSkillLines before editing an existing skill.",
      "Use replaceSkillLines for targeted line updates when refining a skill.",
      "Prefer line edits over full writeSkill rewrites for skill refinements.",
      "Use activateSkill to load specialized instructions from skills stored in the skills namespace.",
    ],
  },
);
