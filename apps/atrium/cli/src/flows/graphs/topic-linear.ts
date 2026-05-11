import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const TOPIC_ROOT = "atrium.cli.flow.topic.root";

export function topicLinearTransitions(mode: "subscribe" | "unsubscribe"): CliLinearTransition[] {
  return [
    {
      stepId: "topic",
      title: mode === "subscribe" ? "Subscribe to topic" : "Unsubscribe from topic",
      bindPolicy: {
        version: "1",
        properties: [
          {
            type: "text",
            name: "Topic slug",
            prompt: "Topic slug",
            constraints: { minLength: 1 },
          },
        ],
      },
      nextOfferType: `atrium.cli.flow.topic.${mode}.done`,
      terminal: true,
    },
  ];
}
