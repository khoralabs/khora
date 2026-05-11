import type { AtriumCliContext } from "../flows/context.ts";
import { runHealthCommand } from "./health.ts";
import { runInboxListCommand } from "./inbox-list.ts";
import { runKeyCommand } from "./key.ts";
import { runKillCommand } from "./kill.ts";
import { runPostCreateCommand } from "./post-create.ts";
import { runPostDeleteCommand } from "./post-delete.ts";
import { runPostUpdateCommand } from "./post-update.ts";
import { runProfileUpdateCommand } from "./profile-update.ts";
import { runRegisterCommand } from "./register.ts";
import { runStartCommand } from "./start.ts";
import { runStatusCommand } from "./status.ts";
import { runTopicSubscribeCommand } from "./topic-subscribe.ts";
import { runTopicUnsubscribeCommand } from "./topic-unsubscribe.ts";
import type { FlagMap } from "./types.ts";

export interface AtriumCliCommandHandlers {
  key(sub: string | undefined, flags: FlagMap): Promise<void>;
  health(ctx: AtriumCliContext): Promise<void>;
  start(flags: FlagMap): Promise<void>;
  status(flags: FlagMap): void;
  kill(flags: FlagMap): Promise<void>;
  register(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  profileUpdate(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  inboxList(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  postCreate(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  postUpdate(ctx: AtriumCliContext, postId: string, flags: FlagMap): Promise<void>;
  postDelete(ctx: AtriumCliContext, postId: string, flags: FlagMap): Promise<void>;
  topicSubscribe(ctx: AtriumCliContext, slug: string | undefined, flags: FlagMap): Promise<void>;
  topicUnsubscribe(ctx: AtriumCliContext, slug: string | undefined, flags: FlagMap): Promise<void>;
}

export const defaultAtriumCliCommandHandlers = {
  key: runKeyCommand,
  health: runHealthCommand,
  start: runStartCommand,
  status: runStatusCommand,
  kill: runKillCommand,
  register: runRegisterCommand,
  profileUpdate: runProfileUpdateCommand,
  inboxList: runInboxListCommand,
  postCreate: runPostCreateCommand,
  postUpdate: runPostUpdateCommand,
  postDelete: runPostDeleteCommand,
  topicSubscribe: runTopicSubscribeCommand,
  topicUnsubscribe: runTopicUnsubscribeCommand,
} satisfies AtriumCliCommandHandlers;
