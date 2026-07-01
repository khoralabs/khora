import { toolkit } from "@khoralabs/agent-capabilities";

import { khoraToolkit } from "./khora/khora-toolkit.ts";
import { searchMemoriesTool } from "./memories/search-memories.ts";
import { writeMemoryTool } from "./memories/write-memory.ts";
import { activateSkillTool } from "./skills/activate-skill.ts";
import { writeSkillTool } from "./skills/write-skill.ts";

export const harnessToolkit = toolkit(
  [searchMemoriesTool, writeMemoryTool, writeSkillTool, activateSkillTool, khoraToolkit],
  {
    name: "network-harness",
  },
);
