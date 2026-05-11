import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const POST_CREATE_ROOT = "atrium.cli.flow.post.root";

const isProbeKind = (binds: Record<string, Record<string, unknown>>): boolean =>
  binds.kind?.kind === "probe";

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
            choices: ["post", "probe", "status"],
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
    stepId: "matchKinds",
    title: "Probe match kinds (probe only)",
    skipIf: (b) => !isProbeKind(b),
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "choice",
          name: "Kinds",
          prompt: "Match incoming post kinds (comma-separated, blank to match any)",
          optional: true,
          constraints: { choices: ["post", "status"], maxSelections: 2 },
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post.after_match_kinds",
  },
  {
    stepId: "minScore",
    title: "Probe minimum hit score (probe only)",
    skipIf: (b) => !isProbeKind(b),
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "float",
          name: "Score",
          prompt:
            "Minimum cosine similarity 0..1 (blank = no threshold). Rule of thumb: 0.6 = clearly related, 0.75 = strong match, 0.85+ = very strong",
          optional: true,
          constraints: { min: 0, max: 1 },
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post.after_min_score",
  },
  {
    stepId: "expiresAt",
    title: "Probe expiry (probe only)",
    skipIf: (b) => !isProbeKind(b),
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "text",
          name: "Expires",
          prompt: "Expires at (ISO date, e.g. 2026-12-31T00:00:00Z, or epoch ms; blank = never)",
          optional: true,
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.post.after_expires_at",
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
