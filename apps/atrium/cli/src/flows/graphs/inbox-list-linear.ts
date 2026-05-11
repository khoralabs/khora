import type { CliLinearTransition } from "../obp/linear-runner.ts";

export const INBOX_LIST_ROOT = "atrium.cli.flow.inbox.root";

export const inboxListLinearTransitions: CliLinearTransition[] = [
  {
    stepId: "inbox",
    title: "Inbox list options",
    bindPolicy: {
      version: "1",
      properties: [
        {
          type: "int",
          name: "Limit",
          prompt: "Limit (optional, default from server)",
          optional: true,
          constraints: { min: 1, max: 500 },
        },
        {
          type: "boolean",
          name: "Mark read",
          prompt: "Mark fetched notifications as read?",
          optional: true,
        },
      ],
    },
    nextOfferType: "atrium.cli.flow.inbox.complete",
    terminal: true,
  },
];
