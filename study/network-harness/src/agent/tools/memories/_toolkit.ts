import { toolkit } from "@khoralabs/agent-capabilities";

import { searchMemoriesTool } from "./search-memories.ts";
import { writeMemoryTool } from "./write-memory.ts";

export const memoriesToolkit = toolkit([searchMemoriesTool, writeMemoryTool], {
  name: "memories",
  instructions: [
    "Use searchMemories to recall relevant context from the agent's memory database.",
    "Use writeMemory to persist notes and observations in an appropriate namespace.",
  ],
});
