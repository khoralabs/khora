import type {
  AtriumRelationshipItem,
  AtriumRoomCreateBody,
  AtriumRoomCreateResponse,
  AtriumRoomJoinRequestBody,
  AtriumRoomJoinTicketResponse,
  AtriumRoomMintTicketBody,
  AtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
import {
  zAtriumRelationshipItem,
  zAtriumRoomCreateResponse,
  zAtriumRoomJoinTicketResponse,
  zAtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

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

export function getRoom(t: AtriumUnaryTransport, roomId: string): Promise<AtriumRelationshipItem> {
  const path = `/v1/rooms/${encodeURIComponent(roomId)}`;
  return t.requestJson("GET", path, {
    parse: zAtriumRelationshipItem,
  });
}

export function leaveRoom(t: AtriumUnaryTransport, roomId: string): Promise<void> {
  const path = `/v1/rooms/${encodeURIComponent(roomId)}`;
  return t.requestVoid("DELETE", path);
}
