import type { CommandHelp } from "@khoralabs/cli-kit";

import {
  chainCreateHelp,
  chainListHelp,
  chainSnapshotHelp,
} from "./chain.help.ts";
import { connectHelp } from "./connect.help.ts";
import { listHelp } from "./list.help.ts";
import { offerListHelp, offerReadHelp, offerSendTurnHelp } from "./offer.help.ts";
import { portListHelp, portReadHelp } from "./port.help.ts";
import { policyReadHelp, policyValidateHelp } from "./policy.help.ts";
import { registerHelp } from "./register.help.ts";
import { roomCreateHelp, roomJoinHelp } from "./room.help.ts";

export const allCommandHelp: readonly CommandHelp[] = [
  registerHelp,
  roomCreateHelp,
  roomJoinHelp,
  listHelp,
  connectHelp,
  chainCreateHelp,
  chainListHelp,
  chainSnapshotHelp,
  offerListHelp,
  offerReadHelp,
  offerSendTurnHelp,
  portListHelp,
  portReadHelp,
  policyReadHelp,
  policyValidateHelp,
];
