export type FlagMap = Record<string, string | boolean>;

export type ParsedArgv = {
  positional: string[];
  flags: FlagMap;
};
