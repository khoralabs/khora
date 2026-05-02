import { expect, test } from "bun:test";
import { isLlmConfigured } from "./llm-env.ts";

test("isLlmConfigured is boolean without throwing", () => {
  expect(typeof isLlmConfigured()).toBe("boolean");
});
