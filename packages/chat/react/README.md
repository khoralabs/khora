# @khoralabs/chat-react

Headless React hooks, compound components, and styled chat UI for the generic chat framework.

## Exports

- `@khoralabs/chat-react` — providers, hooks, adapters, scroll/drag-drop utilities
- `@khoralabs/chat-react/client` — `ChatClient`, merge helpers, display adapters
- `@khoralabs/chat-react/ui` — ai-elements primitives and thread/message/composer assemblies
- `@khoralabs/chat-react/styles/globals.css` — shadcn theme stylesheet (import in host app)

## Scope

This package owns:

- Headless data layer: `ChatProvider`, `useThreadPosts`, `usePostComposer`, `ChatClient`
- Post/display adapters: `postToDisplayMessage`, part extraction helpers
- Scroll behavior: stick-to-bottom, scroll-up-after-send pad, deep-link scroll
- Drag/drop overlay and attachment bridge utilities
- AI-elements subset: conversation, message, prompt-input, attachments, tool, shimmer
- Compound assemblies: `PostMessages`, `PromptComposer`, `ChatThreadView`
- Generic shadcn UI primitives required by the above

Host apps (e.g. Exedra) keep session orchestration: tabs, opt-in gates, WS/turn/bootstrap wiring, belief canvas, session completion, facilitation dispatch, domain-specific tool renderers, and document metadata UI.

## Extension Pattern

Compose package assemblies and override domain seams via compound children:

```tsx
<PostMessages messages={messages} status={status} loadingAuthor={agentAuthor}>
  <PostMessagesLoading />
  {messages.map((post) => (
    <PostMessage key={post.id} post={post}>
      <PostMessageHeader />
      <PostMessageTools>{/* domain-specific tools */}</PostMessageTools>
      <PostMessageAttachments>{/* domain-specific attachment metadata */}</PostMessageAttachments>
      <PostMessageContent />
      <PostMessageTimestamp />
    </PostMessage>
  ))}
  <PostMessagesScrollPad />
</PostMessages>
```

## Headless Example

```tsx
import {
  ChatProvider,
  ThreadRoot,
  useThreadPosts,
  postToDisplayMessage,
} from "@khoralabs/chat-react";

<ChatProvider client={client}>
  <ThreadRoot threadId="thread-1">
    <PostList>{(posts) => posts.map(/* ... */)}</PostList>
  </ThreadRoot>
</ChatProvider>
```

## Styled UI Example

```tsx
import { postsToDisplayMessages } from "@khoralabs/chat-react";
import { ChatThreadView, PostMessage, PostMessageTools } from "@khoralabs/chat-react/ui";

<ChatThreadView
  messages={postsToDisplayMessages(posts, { resolveAuthor })}
  status={status}
  connected={connected}
  canWrite
  /* ... */
>
  {/* optional compound overrides */}
</ChatThreadView>
```

## Hooks

- `useChannel`, `useThreads`, `useThreadPosts`, `usePostComposer`
- `useAgentLoadingIndicator`, `useThreadScrollPad`, `useScrollToPost`, `useChatDragDrop`

## Styling

This package uses Tailwind + shadcn. Host apps should import `@khoralabs/chat-react/styles/globals.css` or mirror its CSS variables.
