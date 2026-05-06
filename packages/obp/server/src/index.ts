import { type ParsedObpUrl, parseObpUrl } from "./parse-url.ts";
import { type ObpServeOptions, type ObpServerHandle, serveObp } from "./serve.ts";

export const Obp = {
  serve: serveObp,
};

export type { ObpServeOptions, ObpServerHandle, ParsedObpUrl };
export { parseObpUrl, serveObp };
