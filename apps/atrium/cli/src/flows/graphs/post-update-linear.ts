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
      ],
    },
    nextOfferType: "atrium.cli.flow.post_update.complete",
    terminal: true,
  },
];
