export type FlagMap = Record<string, string | boolean>;

export type ParsedArgv = {
  positional: string[];
  flags: FlagMap;
};

export interface CommandHelp {
  /** Command id, e.g. `register` or `channel create` (space-separated prefixes). */
  command: string;
  summary: string;
  /** Interactive usage (prompts when run without required flags). */
  wizard?: string;
  /** Non-interactive usage (flags / args for scripting, CI, LLM tool calls). */
  args?: string;
}
