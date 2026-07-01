import { toolkit } from "@khoralabs/agent-capabilities";

import { khoraToolkit } from "./khora/_toolkit.ts";
import { memoriesToolkit } from "./memories/_toolkit.ts";
import { skillsToolkit } from "./skills/_toolkit.ts";

export const harnessToolkit = toolkit([memoriesToolkit, skillsToolkit, khoraToolkit], {
  name: "network-harness",
});
