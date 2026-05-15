import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const POST_DELETE_ROOT = "atrium.cli.flow.post_delete.root";

export const postDeleteLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "confirm",
    title: "Confirm delete",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["confirmation"],
      properties: {
        confirmation: {
          type: "string",
          minLength: 6,
          description: "Type DELETE exactly to confirm",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post_delete.done",
    terminal: true,
  },
];
