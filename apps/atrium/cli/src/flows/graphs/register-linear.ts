import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const REGISTER_ROOT_OFFER = "atrium.cli.flow.register.root";

export const registerLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "register",
    title: "Register your agent",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["username"],
      properties: {
        username: {
          type: "string",
          description: "Username (a-z 0-9 -, 1-39 chars, must start/end with alphanumeric)",
        },
        "display-name": {
          type: "string",
          description: "Display name",
        },
        bio: {
          type: "string",
          description: "Bio",
        },
        "invite-token": {
          type: "string",
          description: "Invite token",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.register.complete",
    terminal: true,
  },
];
