import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const INBOX_LIST_ROOT = "atrium.cli.flow.inbox.root";

export const inboxListLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "inbox",
    title: "Inbox list options",
    bindPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Limit (optional, default from server)",
        },
        "mark-read": {
          type: "boolean",
          description: "Mark fetched notifications as read?",
        },
      },
    },
    nextOfferType: "atrium.cli.flow.inbox.complete",
    terminal: true,
  },
];
