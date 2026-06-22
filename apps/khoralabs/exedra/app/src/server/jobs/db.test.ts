import { describe, expect, test } from "bun:test";

import { getDb } from "../db/index";
import { appendJobEvents, createJob, getJob, getJobEventsSince, setJobStatus } from "./db";

describe("jobs db", () => {
  test("creates job, appends ordered events, and updates status", () => {
    const db = getDb();
    const job = createJob(db, {
      kind: "memory_investigation",
      payload: { question: "test" },
      ownerUserId: "user-1",
    });

    expect(job.status).toBe("pending");
    expect(job.ownerUserId).toBe("user-1");

    appendJobEvents(db, job.id, [
      { type: "status", status: "running" },
      { type: "investigation_step", step: 1, message: "Searching…" },
    ]);

    const events = getJobEventsSince(db, job.id, 0);
    expect(events).toHaveLength(2);
    expect(events[0]?.seq).toBe(1);
    expect(events[1]?.seq).toBe(2);

    setJobStatus(db, job.id, "done", { result: { answer: "ok" } });
    const updated = getJob(db, job.id);
    expect(updated?.status).toBe("done");
    expect(updated?.result).toEqual({ answer: "ok" });
  });
});
