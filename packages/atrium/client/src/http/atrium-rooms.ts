import type {
  AtriumRoomCreateBody,
  AtriumRoomListResponse,
  AtriumRoomMintTicketBody,
  AtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
import { zAtriumRoomListResponse, zAtriumRoomTicketResponse } from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

export function createAtriumRoom(
  t: AtriumUnaryTransport,
  body: AtriumRoomCreateBody,
): Promise<AtriumRoomTicketResponse> {
  return t.requestJson("POST", "/v1/atrium/rooms", {
    body,
    parse: zAtriumRoomTicketResponse,
  });
}

export function listAtriumRooms(t: AtriumUnaryTransport): Promise<AtriumRoomListResponse> {
  return t.requestJson("GET", "/v1/atrium/rooms", {
    parse: zAtriumRoomListResponse,
  });
}

export function mintAtriumRoomTicket(
  t: AtriumUnaryTransport,
  roomId: string,
  body?: AtriumRoomMintTicketBody,
): Promise<AtriumRoomTicketResponse> {
  const path = `/v1/atrium/rooms/${encodeURIComponent(roomId)}/ticket`;
  return t.requestJson("POST", path, {
    ...(body !== undefined ? { body } : {}),
    parse: zAtriumRoomTicketResponse,
  });
}
