import type { Database } from "bun:sqlite";

import type { JobEvent, JobStatus } from "@khoralabs/exedra-workflows-shared/jobs/jobs";

import { getJob, getJobEventsSince } from "./db.js";
import { waitForJobEvent } from "./notify.js";

const TERMINAL_STATUSES = new Set<JobStatus>(["done", "failed", "cancelled"]);
const POLL_MS = 500;
const HEARTBEAT_MS = 15_000;

function encodeSseEvent(seq: number, event: JobEvent): string {
  return `id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`;
}

function encodeSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

export function createJobEventStream(
  db: Database,
  jobId: string,
  fromSeq: number,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor = fromSeq;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
        if (pollTimer !== null) clearTimeout(pollTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const flush = () => {
        if (closed) return;
        const records = getJobEventsSince(db, jobId, cursor);
        for (const record of records) {
          controller.enqueue(encoder.encode(encodeSseEvent(record.seq, record.event)));
          cursor = record.seq;
        }

        const job = getJob(db, jobId);
        if (job !== null && TERMINAL_STATUSES.has(job.status)) {
          const trailing = getJobEventsSince(db, jobId, cursor);
          for (const record of trailing) {
            controller.enqueue(encoder.encode(encodeSseEvent(record.seq, record.event)));
            cursor = record.seq;
          }
          close();
        }
      };

      const scheduleWait = () => {
        if (closed) return;
        void waitForJobEvent(jobId, signal)
          .then(() => {
            flush();
            if (!closed) scheduleWait();
          })
          .catch(() => {
            close();
          });
      };

      heartbeatTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSseComment("heartbeat")));
        } catch {
          close();
        }
      }, HEARTBEAT_MS);

      signal?.addEventListener("abort", close, { once: true });

      flush();
      if (!closed) {
        scheduleWait();
        pollTimer = setTimeout(function poll() {
          if (closed) return;
          flush();
          pollTimer = setTimeout(poll, POLL_MS);
        }, POLL_MS);
      }
    },
    cancel() {
      closed = true;
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      if (pollTimer !== null) clearTimeout(pollTimer);
    },
  });
}
