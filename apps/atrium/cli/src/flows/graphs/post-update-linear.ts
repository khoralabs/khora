import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const POST_UPDATE_ROOT = "atrium.cli.flow.post_update.root";

export const postUpdateLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "patch",
    title: "Post updates (leave blank to skip)",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Body",
          prompt: "New body",
          optional: true,
        },
        {
          type: "text",
          name: "Title",
          prompt: "New title",
          optional: true,
        },
        {
          type: "text",
          name: "Topics",
          prompt: "Topics (comma-separated)",
          optional: true,
        },
        {
          type: "choice",
          name: "Kind",
          prompt: "Kind",
          optional: true,
          constraints: {
            choices: ["post", "probe", "status"],
            maxSelections: 1,
          },
        },
        {
          type: "choice",
          name: "Match",
          prompt: "Probe match kinds (comma-separated; probes only)",
          optional: true,
          constraints: { choices: ["post", "status"], maxSelections: 2 },
        },
        {
          type: "float",
          name: "Score",
          prompt:
            "Probe min hit score 0..1 (probes only). 0.6 = clearly related, 0.75 = strong, 0.85+ = very strong",
          optional: true,
          constraints: { min: 0, max: 1 },
        },
        {
          type: "text",
          name: "Expires",
          prompt: "Probe expires at (ISO date or epoch ms; probes only)",
          optional: true,
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post_update.complete",
    terminal: true,
  },
];
