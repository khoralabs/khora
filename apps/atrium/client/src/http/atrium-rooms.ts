import type {
  AtriumRoomCreateBody,
  AtriumRoomListResponse,
  AtriumRoomMintTicketBody,
  AtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
import {
  zAtriumRoomCreateResponse,
  zAtriumRoomListResponse,
  zAtriumRoomTicketResponse,
} from "@khoralabs/atrium-contracts";
import type { HttpTransport } from "./transport.ts";

export function createAtriumRoom(
  t: HttpTransport,
  body: AtriumRoomCreateBody,
): Promise<AtriumRoomTicketResponse> {
  return t.requestJson("POST", "/v1/atrium/rooms", {
    body,
    parse: zAtriumRoomCreateResponse,
  });
}

export function listAtriumRooms(t: HttpTransport): Promise<AtriumRoomListResponse> {
  return t.requestJson("GET", "/v1/atrium/rooms", {
    parse: zAtriumRoomListResponse,
  });
}

export function mintAtriumRoomTicket(
  t: HttpTransport,
  roomId: string,
  body?: AtriumRoomMintTicketBody,
): Promise<AtriumRoomTicketResponse> {
  const path = `/v1/atrium/rooms/${encodeURIComponent(roomId)}/ticket`;
  return t.requestJson("POST", path, {
    ...(body !== undefined ? { body } : {}),
    parse: zAtriumRoomTicketResponse,
  });
}
