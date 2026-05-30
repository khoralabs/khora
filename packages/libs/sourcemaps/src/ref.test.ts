import { describe, expect, test } from "bun:test";
import type { ContentAddressedRef, ContentHash, SourceRef } from "./types";
import { isContentAddressedRef } from "./types";

type ExampleLocators = { container_id: string; entry_key: string };

describe("SourceRef", () => {
  test("ref without hash is SourceRef but not ContentAddressedRef", () => {
    const ref: SourceRef<ExampleLocators> = {
      container_id: "ctr_1",
      entry_key: "body",
    };
    expect(isContentAddressedRef(ref)).toBe(false);
    if (isContentAddressedRef(ref)) {
      const _hash: ContentHash = ref.content_hash;
      void _hash;
    }
  });

  test("ref with content_hash satisfies ContentAddressedRef", () => {
    const ref: ContentAddressedRef<ExampleLocators> = {
      container_id: "ctr_1",
      entry_key: "body",
      content_hash: "a".repeat(64),
    };
    expect(isContentAddressedRef(ref)).toBe(true);
    if (isContentAddressedRef(ref)) {
      expect(ref.content_hash).toHaveLength(64);
    }
  });

  test("isContentAddressedRef narrows optional hash on SourceRef", () => {
    const ref: SourceRef<ExampleLocators> & { content_hash?: ContentHash } = {
      container_id: "ctr_1",
      entry_key: "body",
      content_hash: "b".repeat(64),
    };
    expect(isContentAddressedRef(ref)).toBe(true);
    if (isContentAddressedRef(ref)) {
      expect(ref.content_hash).toBe("b".repeat(64));
    }
  });
});
