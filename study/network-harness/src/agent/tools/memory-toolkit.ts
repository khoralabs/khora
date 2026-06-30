import { toolkit } from "@khoralabs/agent-capabilities";

import { activateSkillTool } from "./activate-skill.ts";
import { searchMemoriesTool } from "./search-memories.ts";
import { writeMemoryTool } from "./write-memory.ts";
import { writeSkillTool } from "./write-skill.ts";

export const harnessMemoryToolkit = toolkit(
  [searchMemoriesTool, writeMemoryTool, writeSkillTool, activateSkillTool],
  {
    name: "network-harness-memory",
  },
);
