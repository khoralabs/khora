# `@khoralabs/atrium-contracts`

Zod schemas and TypeScript types shared across the **at2** packages. No runtime behaviour beyond validation helpers — host, client, and relay agree on the same wire shapes.

## What lives here

- **Profile** (`atrium-profile.ts`) — `AtriumProfile`, `AtriumProfilePatch`, lexical text helpers.
- **Post** (`atrium-post.ts`) — `AtriumPost`, `AtriumPostCreate`, `AtriumPostPatch`, `kind: "post" | "status" | "subscription"`, standing search, visibility, and merge helpers.
- **Subscription searches** (`atrium-subscription-searches.ts`) — `topicSubscriptionSearch`, `authorSubscriptionSearch`, `authorTopicSubscriptionSearch` for `createSubscription` bodies.
- **Registration** (`atrium-registration.ts`) — request/response shapes for agent registration.
- **Topic slugs** (`topic-slug.ts`) — `normalizeTopicSlug` for canonical topic strings.
- **Username** (`username.ts`) — `normalizeUsername` / `zUsername` for handle rules shared with relay social registration.

## Role in the directory

Anything that crosses a process boundary in at2 should be validated or typed through these schemas first. This package depends only on `zod` and `@khoralabs/agent-relay`. Keep it dependency-light.
