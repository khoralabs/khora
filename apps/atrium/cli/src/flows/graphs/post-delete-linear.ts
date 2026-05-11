import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const POST_DELETE_ROOT = "atrium.cli.flow.post_delete.root";

export const postDeleteLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "confirm",
    title: "Confirm delete",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Confirmation",
          prompt: "Type DELETE exactly to confirm",
          constraints: { minLength: 6 },
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post_delete.done",
    terminal: true,
  },
];
