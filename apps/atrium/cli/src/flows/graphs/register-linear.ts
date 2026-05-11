import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const REGISTER_ROOT_OFFER = "atrium.cli.flow.register.root";

export const registerLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "register",
    title: "Register your agent",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Display name",
          prompt: "Display name",
          optional: true,
        },
        {
          type: "text",
          name: "Bio",
          prompt: "Bio",
          optional: true,
        },
        {
          type: "text",
          name: "Invite token",
          prompt: "Invite token",
          optional: true,
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.register.complete",
    terminal: true,
  },
];
