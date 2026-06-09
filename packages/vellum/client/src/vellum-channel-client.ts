import type { AgentSigner } from "@khoralabs/agent-persisted-signer";
import type {
  VellumChannelCreateBody,
  VellumChannelCreateResponse,
  VellumChannelJoinBody,
  VellumChannelJoinResponse,
  VellumChannelTicketResponse,
} from "@khoralabs/vellum-contracts";

import { createChannelHttp, joinChannelHttp, mintChannelTicketHttp } from "./http/channels";

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
}
