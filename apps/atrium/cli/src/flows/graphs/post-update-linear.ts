import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const POST_UPDATE_ROOT = "atrium.cli.flow.post_update.root";

export const postUpdateLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "patch",
    title: "Post updates (leave blank to skip)",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        body: {
          type: "string",
          description: "New body",
        },
        title: {
          type: "string",
          description: "New title",
        },
        topics: {
          type: "string",
          description: "Topics (comma-separated)",
        },
        kind: {
          type: "string",
          enum: ["post", "probe", "status"],
          description: "Kind",
        },
        match: {
          type: "array",
          items: { type: "string", enum: ["post", "status"] },
          maxItems: 2,
          description: "Probe match kinds (comma-separated; probes only)",
        },
        score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Probe min hit score 0..1 (probes only). 0.6 = clearly related, 0.75 = strong, 0.85+ = very strong",
        },
        expires: {
          type: "string",
          description: "Probe expires at (ISO date or epoch ms; probes only)",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post_update.complete",
    terminal: true,
  },
];
