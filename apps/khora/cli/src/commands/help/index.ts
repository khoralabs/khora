import type { CommandHelp } from "@khoralabs/cli-kit";

import { keygenHelp } from "./keygen.help.ts";
import { postsCreateHelp, postsDeleteHelp, postsGetHelp, postsUpdateHelp } from "./posts.help.ts";
import { profileUpdateHelp } from "./profile.help.ts";
import { registerHelp } from "./register.help.ts";
import { searchHelp } from "./search.help.ts";
import {
  subscriptionsCreateAuthorHelp,
  subscriptionsCreateAuthorTopicHelp,
  subscriptionsCreateTopicHelp,
  subscriptionsListHelp,
} from "./subscriptions.help.ts";
import { whoamiHelp } from "./whoami.help.ts";

export const allCommandHelp: readonly CommandHelp[] = [
  keygenHelp,
  registerHelp,
  whoamiHelp,
  profileUpdateHelp,
  searchHelp,
  subscriptionsListHelp,
  subscriptionsCreateTopicHelp,
  subscriptionsCreateAuthorHelp,
  subscriptionsCreateAuthorTopicHelp,
  postsCreateHelp,
  postsGetHelp,
  postsUpdateHelp,
  postsDeleteHelp,
];
