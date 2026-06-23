# @khoralabs/chat-react

Headless React hooks and compound components for generic chat UIs.

## Design

- Transport is injected via `ChatClient` — no fetch/WebSocket/Exedra assumptions
- Posts are AI SDK-compatible messages with ledger fields
- Components expose render props and unstyled primitives

## Example

```tsx
import {
  ChatProvider,
  ChannelRoot,
  ThreadRoot,
  PostList,
  PostItem,
  PostParts,
  usePostComposer,
} from "@khoralabs/chat-react";

<ChatProvider client={client}>
  <ChannelRoot channelId="channel-1">
    <ThreadRoot threadId="thread-1">
      <PostList>
        {(posts) =>
          posts.map((post) => (
            <PostItem key={post.id} postId={post.id}>
              {(item) => <PostParts postId={item.id}>{(parts) => /* render */ parts}</PostParts>}
            </PostItem>
          ))
        }
      </PostList>
    </ThreadRoot>
  </ChannelRoot>
</ChatProvider>
```

## Hooks

- `useChannel(channelId)`
- `useThreads(channelId)`
- `useThreadPosts(threadId)`
- `usePostComposer(threadId)`
- `useChatClient()`

Optional `client.subscribeToThread(threadId, handler)` enables live refresh on append/update/delete events.

## AI SDK helpers

- `postToUiMessage(post)` / `postsToUiMessages(posts)` — pass posts directly to AI SDK hooks
