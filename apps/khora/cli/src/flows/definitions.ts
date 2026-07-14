import type { FlowDefinition } from "@khoralabs/cli-flow";

export const registerFlowDefinition: FlowDefinition = {
  id: "khora-register",
  offers: [
    {
      id: "register",
      ports: [
        { id: "username", prompt: "Username: " },
        { id: "displayName", prompt: "Name: " },
        { id: "bio", prompt: "Bio: " },
        {
          id: "inviteToken",
          prompt: "Invite token (optional): ",
          optional: true,
        },
      ],
    },
  ],
};

export const profileUpdateFlowDefinition: FlowDefinition = {
  id: "khora-profile-update",
  offers: [
    {
      id: "update",
      ports: [
        {
          id: "displayName",
          prompt: "Name (leave empty to skip): ",
          optional: true,
        },
        {
          id: "bio",
          prompt: "Bio (leave empty to skip): ",
          optional: true,
        },
      ],
    },
  ],
};

export const postsCreateFlowDefinition: FlowDefinition = {
  id: "khora-posts-create",
  offers: [
    {
      id: "create",
      ports: [
        { id: "body", prompt: "Body: " },
        { id: "title", prompt: "Title (optional): ", optional: true },
        {
          id: "topics",
          prompt: "Topics, comma-separated (optional): ",
          optional: true,
        },
        {
          id: "visibility",
          prompt: "Visibility [public/network/private] (optional): ",
          optional: true,
        },
      ],
    },
  ],
};

export const postsUpdateFlowDefinition: FlowDefinition = {
  id: "khora-posts-update",
  offers: [
    {
      id: "update",
      ports: [
        { id: "body", prompt: "Body (leave empty to skip): ", optional: true },
        { id: "title", prompt: "Title (leave empty to skip): ", optional: true },
        {
          id: "topics",
          prompt: "Topics, comma-separated (leave empty to skip): ",
          optional: true,
        },
        {
          id: "visibility",
          prompt: "Visibility [public/network/private] (leave empty to skip): ",
          optional: true,
        },
      ],
    },
  ],
};

export const subscriptionsCreateFlowDefinition: FlowDefinition = {
  id: "khora-subscriptions-create",
  offers: [
    {
      id: "create",
      ports: [
        { id: "topic", prompt: "Topic slug (optional): ", optional: true },
        { id: "author", prompt: "Author DID or username (optional): ", optional: true },
        { id: "query", prompt: "Semantic query text (optional): ", optional: true },
        { id: "body", prompt: "Body note (optional): ", optional: true },
        { id: "minScore", prompt: "Min score 0–1 (optional): ", optional: true },
        {
          id: "visibility",
          prompt: "Visibility [public/network/private] (optional): ",
          optional: true,
        },
      ],
    },
  ],
};
