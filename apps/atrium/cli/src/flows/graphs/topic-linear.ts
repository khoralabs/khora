import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const TOPIC_ROOT = "atrium.cli.flow.topic.root";

export function topicLinearTransitions(mode: "subscribe" | "unsubscribe"): CliLinearTransition[] {
  return [
    {
      stepId: "topic",
      title: mode === "subscribe" ? "Subscribe to topic" : "Unsubscribe from topic",
      bindPolicy: {
        type: "object",
        additionalProperties: false,
        required: ["topic-slug"],
        properties: {
          "topic-slug": {
            type: "string",
            minLength: 1,
            description: "Topic slug",
          },
        },
      },
      nextOfferType: `atrium.cli.flow.topic.${mode}.done`,
      terminal: true,
    },
  ];
}
