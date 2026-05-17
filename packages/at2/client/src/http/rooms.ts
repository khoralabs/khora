import type {
  AtriumRoomCreateBody,
  AtriumRoomTicketResponse,
} from "@khoralabs/at2-contracts";
import { zAtriumRoomTicketResponse } from "@khoralabs/at2-contracts";
import type { At2UnaryTransport } from "@khoralabs/at2-transport";

export function createRoom(
  t: At2UnaryTransport,
  body: AtriumRoomCreateBody,
): Promise<AtriumRoomTicketResponse> {
  return t.requestJson("POST", "/v1/rooms", {
    body,
    parse: zAtriumRoomTicketResponse,
  });
}
