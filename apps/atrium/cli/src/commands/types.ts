export type FlagMap = Record<string, string | boolean>;

export type ParsedArgv = {
  positional: string[];
  flags: FlagMap;
};

export interface CommandHelp {
  command: string;
  summary: string;
  wizard?: string;
  args?: string;
}
