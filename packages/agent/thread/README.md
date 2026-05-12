# `@khoralabs/agent-thread`

Generic multi-participant **thread** over AI SDK v6 `UIMessage` parts (text, tools, etc.): `ThreadContext` / `InMemoryThreadContext`, `ThreadMessage` metadata (`authorId`, `ts`), formatting for prompts, and helpers to append a `ToolLoopAgent.generate()` turn as one assistant message.

This is not tied to OBP or any specific domain; hosts pass participant ids (e.g. OBP party ids) as strings.
