import { type ParsedObpUrl, parseObpUrl } from "./parse-url.ts";
import {
  type ObpOnConnectContext,
  type ObpResolvedSession,
  type ObpServeOptions,
  type ObpServerHandle,
  serveObp,
} from "./serve.ts";

export const Obp = {
  serve: serveObp,
};

export type {
  ObpOnConnectContext,
  ObpResolvedSession,
  ObpServeOptions,
  ObpServerHandle,
  ParsedObpUrl,
};
export { parseObpUrl, serveObp };
