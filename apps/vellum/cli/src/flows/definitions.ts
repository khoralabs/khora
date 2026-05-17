import type { FlowDefinition } from "@khoralabs/cli-flow-nbc";

/** NBC-shaped register wizard: one offer, string ports (invite optional). */
export const registerFlowDefinition: FlowDefinition = {
  id: "vellum-register",
  offers: [
    {
      id: "register",
      ports: [
        { id: "username", prompt: "Username: " },
        { id: "displayName", prompt: "Display name: " },
        {
          id: "inviteToken",
          prompt: "Invite token (optional): ",
          optional: true,
        },
      ],
    },
  ],
};

export const connectFlowDefinition: FlowDefinition = {
  id: "vellum-connect",
  offers: [
    {
      id: "connect",
      ports: [{ id: "roomId", prompt: "Room ID: " }],
    },
  ],
};

export const roomJoinFlowDefinition: FlowDefinition = {
  id: "vellum-room-join",
  offers: [
    {
      id: "join",
      ports: [{ id: "joinToken", prompt: "Join token: " }],
    },
  ],
};
