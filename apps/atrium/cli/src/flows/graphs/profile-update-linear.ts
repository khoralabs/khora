import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const PROFILE_UPDATE_ROOT = "atrium.cli.flow.profile.root";

export const profileUpdateLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "profile",
    title: "Update profile",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        username: {
          type: "string",
          description: "Username (optional; leave empty to keep)",
        },
        "display-name": {
          type: "string",
          description: "Display name (optional)",
        },
        bio: {
          type: "string",
          description: "Bio (optional)",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.profile.complete",
    terminal: true,
  },
];
