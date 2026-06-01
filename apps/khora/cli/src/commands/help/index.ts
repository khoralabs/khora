import type { CommandHelp } from "@khoralabs/cli-kit";
import { hostListHelp, hostRegisterHelp, hostShowHelp, hostUseHelp } from "./host.help";
import { inboxListenHelp, inboxStatusHelp, inboxStopHelp } from "./inbox.help";
import { keygenHelp } from "./keygen.help";
import { linkHelp } from "./link.help";
import { postsCreateHelp, postsDeleteHelp, postsGetHelp, postsUpdateHelp } from "./posts.help";
import { profileUpdateHelp } from "./profile.help";
import { registerHelp } from "./register.help";
import { searchHelp } from "./search.help";
import {
  subscriptionsCreateAuthorHelp,
  subscriptionsCreateAuthorTopicHelp,
  subscriptionsCreateHelp,
  subscriptionsCreateSemanticHelp,
  subscriptionsCreateTopicHelp,
  subscriptionsListHelp,
} from "./subscriptions.help";
import { unregisterHelp } from "./unregister.help";
import { whoamiHelp } from "./whoami.help";

export const allCommandHelp: readonly CommandHelp[] = [
  keygenHelp,
  hostListHelp,
  hostUseHelp,
  hostShowHelp,
  hostRegisterHelp,
  linkHelp,
  registerHelp,
  unregisterHelp,
  whoamiHelp,
  profileUpdateHelp,
  searchHelp,
  inboxListenHelp,
  inboxStopHelp,
  inboxStatusHelp,
  subscriptionsListHelp,
  subscriptionsCreateHelp,
  subscriptionsCreateTopicHelp,
  subscriptionsCreateAuthorHelp,
  subscriptionsCreateAuthorTopicHelp,
  subscriptionsCreateSemanticHelp,
  postsCreateHelp,
  postsGetHelp,
  postsUpdateHelp,
  postsDeleteHelp,
];
