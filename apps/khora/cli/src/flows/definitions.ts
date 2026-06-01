import type { FlowDefinition } from "@khoralabs/cli-flow-nbc";

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

export const subscriptionsCreateTopicFlowDefinition: FlowDefinition = {
  id: "khora-subscriptions-create-topic",
  offers: [
    {
      id: "create",
      ports: [
        { id: "slug", prompt: "Topic slug: " },
        {
          id: "visibility",
          prompt: "Visibility [public/network/private] (optional): ",
          optional: true,
        },
      ],
    },
  ],
};

export const subscriptionsCreateAuthorFlowDefinition: FlowDefinition = {
  id: "khora-subscriptions-create-author",
  offers: [
    {
      id: "create",
      ports: [
        { id: "username", prompt: "Username: " },
        {
          id: "visibility",
          prompt: "Visibility [public/network/private] (optional): ",
          optional: true,
        },
      ],
    },
  ],
};

export const subscriptionsCreateAuthorTopicFlowDefinition: FlowDefinition = {
  id: "khora-subscriptions-create-author-topic",
  offers: [
    {
      id: "create",
      ports: [
        { id: "username", prompt: "Username: " },
        { id: "slug", prompt: "Topic slug: " },
        {
          id: "visibility",
          prompt: "Visibility [public/network/private] (optional): ",
          optional: true,
        },
      ],
    },
  ],
};

export const subscriptionsCreateSemanticFlowDefinition: FlowDefinition = {
  id: "khora-subscriptions-create-semantic",
  offers: [
    {
      id: "create",
      ports: [
        { id: "searchText", prompt: "Search text (semantic match): " },
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
