# @khoralabs/agent-identity-adapters

Bridges evaluated `@khoralabs/agent-identity` tool specs to Vercel AI SDK `tool()` helpers (`toolSpecToAiTool`, `toolMapToAiTools`). Keeps `@khoralabs/agent-identity` free of a direct `ai` dependency for core types; consumers that run ToolLoopAgent import from this package.
