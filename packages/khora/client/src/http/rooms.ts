import type {
  KhoraRelationshipItem,
  KhoraRoomCreateBody,
  KhoraRoomCreateResponse,
  KhoraRoomJoinRequestBody,
  KhoraRoomJoinTicketResponse,
  KhoraRoomMintTicketBody,
  KhoraRoomTicketResponse,
} from "@khoralabs/khora-contracts";
import {
  zKhoraRelationshipItem,
  zKhoraRoomCreateResponse,
  zKhoraRoomJoinTicketResponse,
  zKhoraRoomTicketResponse,
} from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";

export function createRoom(
  t: KhoraUnaryTransport,
  body: KhoraRoomCreateBody,
): Promise<KhoraRoomCreateResponse> {
  return t.requestJson("POST", "/v1/rooms", {
    body,
    parse: zKhoraRoomCreateResponse,
  });
}

export function redeemRoomInvite(
  t: KhoraUnaryTransport,
  body: KhoraRoomJoinRequestBody,
): Promise<KhoraRoomJoinTicketResponse> {
  return t.requestJson("POST", "/v1/rooms/join", {
    body,
    parse: zKhoraRoomJoinTicketResponse,
  });
}

export function mintRoomTicket(
  t: KhoraUnaryTransport,
  roomId: string,
  body?: KhoraRoomMintTicketBody,
): Promise<KhoraRoomTicketResponse> {
  const path = `/v1/rooms/${encodeURIComponent(roomId)}/ticket`;
  return t.requestJson("POST", path, {
    body: body ?? {},
    parse: zKhoraRoomTicketResponse,
  });
}

export function getRoom(t: KhoraUnaryTransport, roomId: string): Promise<KhoraRelationshipItem> {
  const path = `/v1/rooms/${encodeURIComponent(roomId)}`;
  return t.requestJson("GET", path, {
    parse: zKhoraRelationshipItem,
  });
}

export function leaveRoom(t: KhoraUnaryTransport, roomId: string): Promise<void> {
  const path = `/v1/rooms/${encodeURIComponent(roomId)}`;
  return t.requestVoid("DELETE", path);
}
