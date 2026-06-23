import { describe, expect, test } from "bun:test";
import { showAgentLoading } from "./use-agent-loading.ts";
import { scrollAnchorPostId } from "./use-thread-scroll-pad.ts";

describe("use-agent-loading", () => {
  test("shows loading after user submit", () => {
    expect(showAgentLoading(false, [{ role: "user" }], "submitted")).toBe(true);
  });

  test("hides loading when ready", () => {
    expect(showAgentLoading(false, [{ role: "user" }], "ready")).toBe(false);
  });

  test("shows loading for awaiting opening kickoff", () => {
    expect(showAgentLoading(true, [], "submitted")).toBe(true);
  });
});

describe("scroll anchor", () => {
  test("anchors last user message while submitted", () => {
    expect(
      scrollAnchorPostId(
        [
          { id: "a", role: "assistant" },
          { id: "b", role: "user" },
        ],
        "submitted",
      ),
    ).toBe("b");
  });

  test("returns null when not submitted", () => {
    expect(scrollAnchorPostId([{ id: "b", role: "user" }], "ready")).toBeNull();
  });
});
