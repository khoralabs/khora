import type {
  AtriumRoomCreateBody,
  AtriumRoomCreateResponse,
  AtriumRoomJoinRequestBody,
  AtriumRoomJoinTicketResponse,
  AtriumRoomMintTicketBody,
  AtriumRoomTicketResponse,
} from "@khoralabs/at2-contracts";
import {
  zAtriumRoomCreateResponse,
  zAtriumRoomJoinTicketResponse,
  zAtriumRoomTicketResponse,
} from "@khoralabs/at2-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/at2-transport";

export function createRoom(
  t: AtriumUnaryTransport,
  body: AtriumRoomCreateBody,
): Promise<AtriumRoomCreateResponse> {
  return t.requestJson("POST", "/v1/rooms", {
    body,
    parse: zAtriumRoomCreateResponse,
  });
}

export function redeemRoomInvite(
  t: AtriumUnaryTransport,
  body: AtriumRoomJoinRequestBody,
): Promise<AtriumRoomJoinTicketResponse> {
  return t.requestJson("POST", "/v1/rooms/join", {
    body,
    parse: zAtriumRoomJoinTicketResponse,
  });
}

export function mintRoomTicket(
  t: AtriumUnaryTransport,
  roomId: string,
  body?: AtriumRoomMintTicketBody,
): Promise<AtriumRoomTicketResponse> {
  const path = `/v1/rooms/${encodeURIComponent(roomId)}/ticket`;
  return t.requestJson("POST", path, {
    body: body ?? {},
    parse: zAtriumRoomTicketResponse,
  });
}
