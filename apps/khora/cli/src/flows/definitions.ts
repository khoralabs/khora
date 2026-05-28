import type { FlowDefinition } from "@khoralabs/cli-flow-nbc";

export const registerFlowDefinition: FlowDefinition = {
  id: "khora-register",
  offers: [
    {
      id: "register",
      ports: [
        { id: "username", prompt: "Username: " },
        { id: "displayName", prompt: "Name: " },
        { id: "bio", prompt: "Bio: " },
        {
          id: "inviteToken",
          prompt: "Invite token (optional): ",
          optional: true,
        },
      ],
    },
  ],
};

export const profileUpdateFlowDefinition: FlowDefinition = {
  id: "khora-profile-update",
  offers: [
    {
      id: "update",
      ports: [
        {
          id: "displayName",
          prompt: "Name (leave empty to skip): ",
          optional: true,
        },
        {
          id: "bio",
          prompt: "Bio (leave empty to skip): ",
          optional: true,
        },
      ],
    },
  ],
};
