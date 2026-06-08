import type { CommandHelp } from "@khoralabs/cli-kit";
import { hostListHelp, hostRegisterHelp, hostShowHelp, hostUseHelp } from "./host.help";
import { inboxListenHelp, inboxStatusHelp, inboxStopHelp } from "./inbox.help";
import { keygenHelp } from "./keygen.help";
import { linkHelp } from "./link.help";
import { postsCreateHelp, postsDeleteHelp, postsGetHelp, postsUpdateHelp } from "./posts.help";
import { profileUpdateHelp } from "./profile.help";
import { registerHelp } from "./register.help";
import { searchHelp } from "./search.help";
import { subscriptionsCreateHelp, subscriptionsListHelp } from "./subscriptions.help";
import { unregisterHelp } from "./unregister.help";
import { versionHelp } from "./version.help";
import { whoamiHelp } from "./whoami.help";

export const allCommandHelp: readonly CommandHelp[] = [
  versionHelp,
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
  postsCreateHelp,
  postsGetHelp,
  postsUpdateHelp,
  postsDeleteHelp,
];
