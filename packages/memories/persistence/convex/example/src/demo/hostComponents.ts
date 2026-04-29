import type { FunctionReference } from "convex/server";
import { api } from "../../../convex/_generated/api.js";

type Row = { memoryId: string; key: string; tsCreated: number; bodyText: string | null };

/** Lexical resolve ref for the search demo (`api.memoriesHostQueries`, not `components.memories`). */
export function getMemoriesQueries() {
  const ref = api.memoriesHostQueries?.getLexicalTextForMemorySource;
  if (!ref) {
    throw new Error(
      "Example requires `api.memoriesHostQueries.getLexicalTextForMemorySource` (run convex codegen).",
    );
  }
  return {
    getLexicalTextForMemorySource: ref as unknown as FunctionReference<
      "query",
      "internal",
      { memoryId: string; sourceKey: string },
      string | null
    >,
  };
}

export type { Row };
