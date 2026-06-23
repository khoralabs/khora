import type {
  AppendPostInput,
  Channel,
  ChatEvent,
  ListPostsInput,
  ListThreadsInput,
  Post,
  PostPage,
  ThreadPage,
} from "@khoralabs/chat-core";

export type ChatClient = {
  getChannel(id: string): Promise<Channel>;
  listThreads(input: ListThreadsInput): Promise<ThreadPage>;
  listPosts(input: ListPostsInput): Promise<PostPage>;
  appendPost(input: AppendPostInput): Promise<Post>;
  subscribeToThread?(threadId: string, handler: (event: ChatEvent) => void): () => void;
};

export function postToUiMessage(post: Post): Post {
  return post;
}

export function postsToUiMessages(posts: Post[]): Post[] {
  return posts;
}
