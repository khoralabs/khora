import { parseArgs } from "./commands/parse-args.js";
import { cmdRemember } from "./commands/remember.js";
import { cmdSearch } from "./commands/search.js";
import { cmdTodoAdd } from "./commands/todo-add.js";

const args = parseArgs(process.argv);
if (args.sub === "search") {
  await cmdSearch(args);
} else if (args.sub === "remember") {
  await cmdRemember(args);
} else {
  await cmdTodoAdd(args);
}
