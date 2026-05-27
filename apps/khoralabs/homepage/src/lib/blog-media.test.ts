import { describe, expect, test } from "bun:test";
import path from "node:path";
import { BLOG_MEDIA_DIR, resolveBlogMediaPath } from "./blog-media";

describe("resolveBlogMediaPath", () => {
  test("resolves nested file under media dir", () => {
    const resolved = resolveBlogMediaPath("/blog/media/welcome/hero.jpg");
    expect(resolved).toBe(path.join(BLOG_MEDIA_DIR, "welcome", "hero.jpg"));
  });

  test("rejects path traversal", () => {
    expect(resolveBlogMediaPath("/blog/media/../secret.png")).toBeNull();
  });

  test("rejects unsupported extension", () => {
    expect(resolveBlogMediaPath("/blog/media/welcome/doc.pdf")).toBeNull();
  });
});
