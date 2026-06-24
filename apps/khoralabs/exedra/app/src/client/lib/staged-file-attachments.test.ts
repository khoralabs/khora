import { expect, test } from "bun:test";

import { orgSessionNamespace } from "@/lib/memories-api";
import {
  addStagedFiles,
  fileToAttachment,
  MAX_STAGED_FILES,
  removeStagedAttachment,
} from "@/lib/staged-file-attachments";
import { orgSessionScope } from "../../server/memories/namespaces";

test("addStagedFiles respects max file limit", () => {
  const files = Array.from(
    { length: 3 },
    (_, index) => new File([`file-${index}`], `notes-${index}.txt`, { type: "text/plain" }),
  );
  const staged = addStagedFiles([], files, 2);
  expect(staged).toHaveLength(2);
  expect(staged[0]?.filename).toBe("notes-0.txt");
  expect(staged[1]?.filename).toBe("notes-1.txt");
});

test("removeStagedAttachment drops only the selected file", () => {
  const first = fileToAttachment(new File(["one"], "one.txt", { type: "text/plain" }));
  const second = fileToAttachment(new File(["two"], "two.txt", { type: "text/plain" }));
  const next = removeStagedAttachment([first, second], first.id);
  expect(next).toHaveLength(1);
  expect(next[0]?.id).toBe(second.id);
});

test("orgSessionNamespace matches server orgSessionScope", () => {
  const orgId = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
  const teamId = "550e8400-e29b-41d4-a716-446655440000";
  const sessionId = crypto.randomUUID();
  expect(orgSessionNamespace(orgId, teamId, sessionId)).toBe(
    orgSessionScope(orgId, teamId, sessionId),
  );
});

test("MAX_STAGED_FILES matches contribution batch limit", () => {
  expect(MAX_STAGED_FILES).toBe(10);
});
