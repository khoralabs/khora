import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const PROFILE_UPDATE_ROOT = "atrium.cli.flow.profile.root";

export const profileUpdateLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "profile",
    title: "Update profile",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Username",
          prompt: "Username (optional; leave empty to keep)",
          optional: true,
        },
        {
          type: "text",
          name: "Display name",
          prompt: "Display name (optional)",
          optional: true,
        },
        {
          type: "text",
          name: "Bio",
          prompt: "Bio (optional)",
          optional: true,
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.profile.complete",
    terminal: true,
  },
];
