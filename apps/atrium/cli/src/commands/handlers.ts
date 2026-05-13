import type { AtriumCliContext } from "../flows/context.ts";
import { runAuthorListCommand } from "./author-list.ts";
import { runAuthorSubscribeCommand } from "./author-subscribe.ts";
import { runAuthorTopicSubscribeCommand } from "./author-topic-subscribe.ts";
import { runAuthorTopicUnsubscribeCommand } from "./author-topic-unsubscribe.ts";
import { runAuthorUnsubscribeCommand } from "./author-unsubscribe.ts";
import { runConfigCommand } from "./config.ts";
import { runHealthCommand } from "./health.ts";
import { runInboxListCommand } from "./inbox-list.ts";
import { runKeyCommand } from "./key.ts";
import { runKillCommand } from "./kill.ts";
import { runPostCreateCommand } from "./post-create.ts";
import { runPostDeleteCommand } from "./post-delete.ts";
import { runPostShowCommand } from "./post-show.ts";
import { runPostUpdateCommand } from "./post-update.ts";
import { runProbeListCommand } from "./probe-list.ts";
import { runProfileShowCommand } from "./profile-show.ts";
import { runProfileUpdateCommand } from "./profile-update.ts";
import { runRegisterCommand } from "./register.ts";
import { runSetupCommand } from "./setup.ts";
import { runStartCommand } from "./start.ts";
import { runStatusCommand } from "./status.ts";
import { runTopicListCommand } from "./topic-list.ts";
import { runTopicSubscribeCommand } from "./topic-subscribe.ts";
import { runTopicUnsubscribeCommand } from "./topic-unsubscribe.ts";
import type { FlagMap } from "./types.ts";
import { runUpdateCommand } from "./update.ts";
import { runWhoamiCommand } from "./whoami.ts";

export interface AtriumCliCommandHandlers {
  key(sub: string | undefined, flags: FlagMap): Promise<void>;
  setup(flags: FlagMap): Promise<void>;
  update(flags: FlagMap): Promise<void>;
  config(sub: string | undefined, flags: FlagMap): Promise<void>;
  health(ctx: AtriumCliContext): Promise<void>;
  start(flags: FlagMap): Promise<void>;
  status(flags: FlagMap): void;
  kill(flags: FlagMap): Promise<void>;
  whoami(flags: FlagMap): Promise<void>;
  register(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  profileShow(ctx: AtriumCliContext, did: string | undefined, flags: FlagMap): Promise<void>;
  profileUpdate(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  inboxList(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  postCreate(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  postShow(ctx: AtriumCliContext, postId: string | undefined, flags: FlagMap): Promise<void>;
  postUpdate(ctx: AtriumCliContext, postId: string, flags: FlagMap): Promise<void>;
  postDelete(ctx: AtriumCliContext, postId: string, flags: FlagMap): Promise<void>;
  probeList(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  topicList(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  topicSubscribe(ctx: AtriumCliContext, slug: string | undefined, flags: FlagMap): Promise<void>;
  topicUnsubscribe(ctx: AtriumCliContext, slug: string | undefined, flags: FlagMap): Promise<void>;
  authorList(ctx: AtriumCliContext, flags: FlagMap): Promise<void>;
  authorSubscribe(
    ctx: AtriumCliContext,
    username: string | undefined,
    flags: FlagMap,
  ): Promise<void>;
  authorUnsubscribe(
    ctx: AtriumCliContext,
    username: string | undefined,
    flags: FlagMap,
  ): Promise<void>;
  authorTopicSubscribe(
    ctx: AtriumCliContext,
    username: string | undefined,
    topicSlug: string | undefined,
    flags: FlagMap,
  ): Promise<void>;
  authorTopicUnsubscribe(
    ctx: AtriumCliContext,
    username: string | undefined,
    topicSlug: string | undefined,
    flags: FlagMap,
  ): Promise<void>;
}

export const defaultAtriumCliCommandHandlers = {
  key: runKeyCommand,
  setup: runSetupCommand,
  update: runUpdateCommand,
  config: runConfigCommand,
  health: runHealthCommand,
  start: runStartCommand,
  status: runStatusCommand,
  kill: runKillCommand,
  whoami: runWhoamiCommand,
  register: runRegisterCommand,
  profileShow: runProfileShowCommand,
  profileUpdate: runProfileUpdateCommand,
  inboxList: runInboxListCommand,
  postCreate: runPostCreateCommand,
  postShow: runPostShowCommand,
  postUpdate: runPostUpdateCommand,
  postDelete: runPostDeleteCommand,
  probeList: runProbeListCommand,
  topicList: runTopicListCommand,
  topicSubscribe: runTopicSubscribeCommand,
  topicUnsubscribe: runTopicUnsubscribeCommand,
  authorList: runAuthorListCommand,
  authorSubscribe: runAuthorSubscribeCommand,
  authorUnsubscribe: runAuthorUnsubscribeCommand,
  authorTopicSubscribe: runAuthorTopicSubscribeCommand,
  authorTopicUnsubscribe: runAuthorTopicUnsubscribeCommand,
} satisfies AtriumCliCommandHandlers;
