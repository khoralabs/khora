import { expect, test } from "bun:test";
import { textTranscriptPathFromJsonl } from "./text-transcript.ts";

test("textTranscriptPathFromJsonl pairs .jsonl with .text.txt", () => {
  expect(textTranscriptPathFromJsonl("/a/run_2026.jsonl")).toBe("/a/run_2026.text.txt");
  expect(textTranscriptPathFromJsonl("no-extension")).toBe("no-extension.text.txt");
});
