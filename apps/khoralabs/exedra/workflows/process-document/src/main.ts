import { task } from "@renderinc/sdk/workflows";
import type { ProcessDocumentParams } from "./document-processing.ts";
import { patchDocument } from "./exedra-client.ts";
import { processDocument } from "./process-document.ts";
import "./otel.ts";

const retry = {
  maxRetries: 2,
  waitDurationMs: 2000,
  backoffScaling: 2.0,
};

task(
  {
    name: "processDocument",
    retry,
    timeoutSeconds: 600,
  },
  async function processDocumentTask(params: ProcessDocumentParams): Promise<{ ok: true }> {
    const documentId = params.documentId.trim();
    if (documentId.length === 0) throw new Error("documentId is required");

    try {
      await processDocument(params);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await patchDocument(documentId, {
        status: "failed",
        errorMessage: message,
        processedAtMs: Date.now(),
      }).catch(() => undefined);
      throw err;
    }
  },
);
