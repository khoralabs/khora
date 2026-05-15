import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const POST_CREATE_ROOT = "atrium.cli.flow.post.root";

const isProbeKind = (binds: Record<string, Record<string, unknown>>): boolean =>
  binds.kind?.kind === "probe";

export const postCreateLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "kind",
    title: "Post type",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: {
          type: "string",
          enum: ["post", "probe", "status"],
          description: "Kind",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post.after_kind",
  },
  {
    stepId: "body",
    title: "Post body",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["body"],
      properties: {
        body: {
          type: "string",
          minLength: 1,
          description: "Body text",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post.after_body",
  },
  {
    stepId: "topics",
    title: "Topics",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        topics: {
          type: "string",
          description: "Topics (comma-separated, optional)",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post.after_topics",
  },
  {
    stepId: "matchKinds",
    title: "Probe match kinds (probe only)",
    skipIf: (b) => !isProbeKind(b),
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        kinds: {
          type: "array",
          items: { type: "string", enum: ["post", "status"] },
          maxItems: 2,
          description: "Match incoming post kinds (comma-separated, blank to match any)",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post.after_match_kinds",
  },
  {
    stepId: "minScore",
    title: "Probe minimum hit score (probe only)",
    skipIf: (b) => !isProbeKind(b),
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Minimum cosine similarity 0..1 (blank = no threshold). Rule of thumb: 0.6 = clearly related, 0.75 = strong match, 0.85+ = very strong",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post.after_min_score",
  },
  {
    stepId: "expiresAt",
    title: "Probe expiry (probe only)",
    skipIf: (b) => !isProbeKind(b),
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        expires: {
          type: "string",
          description:
            "Expires at (ISO date, e.g. 2026-12-31T00:00:00Z, or epoch ms; blank = never)",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post.after_expires_at",
  },
  {
    stepId: "title",
    title: "Title",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description: "Title (optional)",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.post.complete",
    terminal: true,
  },
];
