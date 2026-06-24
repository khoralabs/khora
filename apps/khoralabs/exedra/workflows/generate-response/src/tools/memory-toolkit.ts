import { toolkit } from "@khoralabs/agent-capabilities";

import { activateSkillTool } from "./activate-skill.ts";
import { flagBeliefTool } from "./flag-belief.ts";
import { getMemoryProvenanceTool } from "./get-memory-provenance.ts";
import { searchMemoriesTool } from "./search-memories.ts";

export const memoryToolkit = toolkit(
  [searchMemoriesTool, getMemoryProvenanceTool, activateSkillTool, flagBeliefTool],
  {
    name: "generate-response-memory",
  },
);
