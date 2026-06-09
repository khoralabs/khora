import type { AgentSigner } from "@khoralabs/agent-persisted-signer";
import type {
  VellumChannelChainAllocateBody,
  VellumChannelCreateBody,
  VellumChannelCreateResponse,
  VellumChannelJoinBody,
  VellumChannelJoinResponse,
  VellumChannelTicketResponse,
  VellumChannelWsNonceResponse,
} from "@khoralabs/vellum-contracts";

import {
  allocateChainHttp,
  createChannelHttp,
  isChainAllocatedHttp,
  joinChannelHttp,
  mintChannelTicketHttp,
  mintWsNonceHttp,
  releaseChainHttp,
} from "./http/channels";

export type VellumChannelClientOptions = {
  relayBaseUrl: string;
  signer: AgentSigner;
};

export class VellumChannelClient {
  constructor(public readonly opts: VellumChannelClientOptions) {}

  createChannel(body: VellumChannelCreateBody = {}): Promise<VellumChannelCreateResponse> {
    return createChannelHttp(this.opts.relayBaseUrl, this.opts.signer, body);
  }

  joinChannel(body: VellumChannelJoinBody): Promise<VellumChannelJoinResponse> {
    return joinChannelHttp(this.opts.relayBaseUrl, this.opts.signer, body);
  }

  mintTicket(channelId: string): Promise<VellumChannelTicketResponse> {
    return mintChannelTicketHttp(this.opts.relayBaseUrl, this.opts.signer, channelId);
  }

  mintWsNonce(channelId: string): Promise<VellumChannelWsNonceResponse> {
    return mintWsNonceHttp(this.opts.relayBaseUrl, this.opts.signer, channelId);
  }

  allocateChain(
    channelId: string,
    body: VellumChannelChainAllocateBody,
  ): Promise<{ ok: true; sessionId: string }> {
    return allocateChainHttp(this.opts.relayBaseUrl, this.opts.signer, channelId, body);
  }

  isChainAllocated(channelId: string, sessionId: string): Promise<boolean> {
    return isChainAllocatedHttp(this.opts.relayBaseUrl, this.opts.signer, channelId, sessionId);
  }

  releaseChain(channelId: string, sessionId: string): Promise<{ ok: true }> {
    return releaseChainHttp(this.opts.relayBaseUrl, this.opts.signer, channelId, sessionId);
  }
}
