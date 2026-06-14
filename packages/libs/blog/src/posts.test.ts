import { describe, expect, test } from "bun:test";
import {
  filterPostsByTag,
  getAllTags,
  getPost,
  normalizeTags,
  parseFrontmatter,
  sortPostsByDate,
} from "./posts";

describe("normalizeTags", () => {
  test("parses array", () => {
    expect(normalizeTags(["a", " b "])).toEqual(["a", "b"]);
  });

  test("parses comma-separated string", () => {
    expect(normalizeTags("a, b")).toEqual(["a", "b"]);
  });

  test("returns empty for invalid", () => {
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe("parseFrontmatter", () => {
  test("fills defaults from slug", () => {
    expect(parseFrontmatter("my-post", {})).toEqual({
      title: "my-post",
      date: "",
      author: undefined,
      tags: [],
      description: undefined,
      cover: undefined,
      draft: false,
    });
  });

  test("parses cover and coverImage alias", () => {
    expect(parseFrontmatter("x", { cover: "/blog/media/x/hero.jpg" }).cover).toBe(
      "/blog/media/x/hero.jpg",
    );
    expect(parseFrontmatter("x", { coverImage: " https://cdn.example/a.png " }).cover).toBe(
      "https://cdn.example/a.png",
    );
  });
});

describe("sortPostsByDate", () => {
  test("sorts newest first", () => {
    const sorted = sortPostsByDate([
      { slug: "a", date: "2024-01-01", title: "", tags: [] },
      { slug: "b", date: "2025-01-01", title: "", tags: [] },
    ]);
    expect(sorted.map((p) => p.slug)).toEqual(["b", "a"]);
  });
});

describe("getPost", () => {
  test("finds by slug", () => {
    const posts = [{ slug: "foo", title: "", date: "", tags: [] }];
    expect(getPost(posts, "foo")?.slug).toBe("foo");
    expect(getPost(posts, "bar")).toBeUndefined();
  });
});

describe("getAllTags", () => {
  test("returns sorted unique tags", () => {
    expect(getAllTags([{ tags: ["b", "a"] }, { tags: ["a"] }])).toEqual(["a", "b"]);
  });
});

describe("filterPostsByTag", () => {
  test("returns all when tag undefined", () => {
    const posts = [{ slug: "a", title: "", date: "", tags: ["x"] }];
    expect(filterPostsByTag(posts, undefined)).toHaveLength(1);
  });

  test("filters by tag", () => {
    const posts = [
      { slug: "a", title: "", date: "", tags: ["x"] },
      { slug: "b", title: "", date: "", tags: ["y"] },
    ];
    expect(filterPostsByTag(posts, "x").map((p) => p.slug)).toEqual(["a"]);
  });
});
