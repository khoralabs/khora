import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const POST_CREATE_ROOT = "atrium.cli.flow.post.root";

export const postCreateLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "kind",
    title: "Post type",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "choice",
          name: "Kind",
          prompt: "Kind",
          constraints: {
            choices: ["post", "probe"],
            maxSelections: 1,
          },
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post.after_kind",
  },
  {
    stepId: "body",
    title: "Post body",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Body",
          prompt: "Body text",
          constraints: { minLength: 1 },
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post.after_body",
  },
  {
    stepId: "topics",
    title: "Topics",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Topics",
          prompt: "Topics (comma-separated, optional)",
          optional: true,
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post.after_topics",
  },
  {
    stepId: "title",
    title: "Title",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Title",
          prompt: "Title (optional)",
          optional: true,
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post.complete",
    terminal: true,
  },
];
