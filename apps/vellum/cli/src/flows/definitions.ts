import type { FlowDefinition } from "@khoralabs/cli-flow-nbc";

export const connectFlowDefinition: FlowDefinition = {
  id: "vellum-connect",
  offers: [
    {
      id: "connect",
      ports: [{ id: "channelId", prompt: "Channel ID: " }],
    },
  ],
};

export const channelJoinFlowDefinition: FlowDefinition = {
  id: "vellum-channel-join",
  offers: [
    {
      id: "join",
      ports: [{ id: "inviteToken", prompt: "Invite token: " }],
    },
  ],
};

export const channelAttachFlowDefinition: FlowDefinition = {
  id: "vellum-channel-attach",
  offers: [
    {
      id: "attach",
      ports: [
        {
          id: "inviteToken",
          prompt: "Invite token (leave empty if already a member): ",
          optional: true,
        },
      ],
    },
  ],
};
