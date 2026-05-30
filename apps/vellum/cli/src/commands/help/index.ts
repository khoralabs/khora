import type { CommandHelp } from "@khoralabs/cli-kit";

import { chainCreateHelp, chainListHelp, chainSnapshotHelp } from "./chain.help";
import { connectHelp } from "./connect.help";
import { disconnectHelp } from "./disconnect.help";
import { keygenHelp } from "./keygen.help";
import { listHelp } from "./list.help";
import { offerListHelp, offerReadHelp, offerSendTurnHelp } from "./offer.help";
import { policyReadHelp, policyValidateHelp } from "./policy.help";
import { portListHelp, portReadHelp } from "./port.help";
import { registerHelp } from "./register.help";
import {
  roomConnectHelp,
  roomCreateHelp,
  roomJoinHelp,
  roomLeaveHelp,
  roomReadHelp,
} from "./room.help";
import { whoamiHelp } from "./whoami.help";

export const allCommandHelp: readonly CommandHelp[] = [
  keygenHelp,
  registerHelp,
  whoamiHelp,
  roomCreateHelp,
  roomJoinHelp,
  roomConnectHelp,
  roomReadHelp,
  roomLeaveHelp,
  listHelp,
  disconnectHelp,
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
