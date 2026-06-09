import type { AgentSigner } from "@khoralabs/agent-persisted-signer";
import {
  type VellumChannelCreateBody,
  type VellumChannelCreateResponse,
  type VellumChannelJoinBody,
  type VellumChannelJoinResponse,
  type VellumChannelTicketResponse,
  zVellumChannelCreateResponse,
  zVellumChannelJoinResponse,
  zVellumChannelTicketResponse,
} from "@khoralabs/vellum-contracts";

import { signedAgentFetch } from "./agent-sign";

function httpError(statusText: string, j: unknown): string {
  if (typeof j === "object" && j !== null && "error" in j) {
    return String((j as { error: unknown }).error);
  }
  return statusText;
}

export async function createChannelHttp(
  relayBaseUrl: string,
  signer: AgentSigner,
  body: VellumChannelCreateBody = {},
): Promise<VellumChannelCreateResponse> {
  const bodyText = JSON.stringify(body);
  const res = await signedAgentFetch(relayBaseUrl, {
    method: "POST",
    path: "/v1/channels",
    bodyText,
    signer,
  });
  const j: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(httpError(res.statusText, j));
  return zVellumChannelCreateResponse.parse(j);
}

export async function joinChannelHttp(
  relayBaseUrl: string,
  signer: AgentSigner,
  body: VellumChannelJoinBody,
): Promise<VellumChannelJoinResponse> {
  const bodyText = JSON.stringify(body);
  const res = await signedAgentFetch(relayBaseUrl, {
    method: "POST",
    path: "/v1/channels/join",
    bodyText,
    signer,
  });
  const j: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(httpError(res.statusText, j));
  return zVellumChannelJoinResponse.parse(j);
}

export async function mintChannelTicketHttp(
  relayBaseUrl: string,
  signer: AgentSigner,
  channelId: string,
): Promise<VellumChannelTicketResponse> {
  const path = `/v1/channels/${encodeURIComponent(channelId)}/ticket`;
  const res = await signedAgentFetch(relayBaseUrl, {
    method: "POST",
    path,
    bodyText: "{}",
    signer,
  });
  const j: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(httpError(res.statusText, j));
  return zVellumChannelTicketResponse.parse(j);
}
