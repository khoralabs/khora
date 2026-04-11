import { parseArgs } from "./commands/parse-args.js";
import { cmdRemember } from "./commands/remember.js";
import { cmdSearch } from "./commands/search.js";

const args = parseArgs(process.argv);
if (args.sub === "search") {
  await cmdSearch(args);
} else {
  await cmdRemember(args);
}
