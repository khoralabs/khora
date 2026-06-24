import type {
  BatchIntegrationParams,
  InternalDocumentBatchWire,
  InternalDocumentPatchRequest,
  InternalDocumentWire,
} from "@khoralabs/exedra-workflows-process-document/document-processing";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

function baseUrl(): string {
  return requireEnv("EXEDRA_INTERNAL_URL").replace(/\/$/, "");
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireEnv("EXEDRA_INTERNAL_TOKEN")}`,
    "Content-Type": "application/json",
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      if (text.length > 0) message = text;
    }
    throw new Error(message);
  }
  return JSON.parse(text) as T;
}

export async function fetchDocumentBatch(batchId: string): Promise<InternalDocumentBatchWire> {
  const res = await fetch(
    `${baseUrl()}/internal/documents/batches/${encodeURIComponent(batchId)}`,
    {
      headers: authHeaders(),
    },
  );
  const body = await readJson<{ batch: InternalDocumentBatchWire }>(res);
  return body.batch;
}

export async function fetchDocumentMeta(documentId: string): Promise<InternalDocumentWire> {
  const res = await fetch(`${baseUrl()}/internal/documents/${encodeURIComponent(documentId)}`, {
    headers: authHeaders(),
  });
  const body = await readJson<{ document: InternalDocumentWire }>(res);
  return body.document;
}

export async function fetchDocumentBytes(documentId: string): Promise<Uint8Array> {
  const res = await fetch(
    `${baseUrl()}/internal/documents/${encodeURIComponent(documentId)}/bytes`,
    { headers: { Authorization: `Bearer ${requireEnv("EXEDRA_INTERNAL_TOKEN")}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function patchDocument(
  documentId: string,
  patch: InternalDocumentPatchRequest,
): Promise<InternalDocumentWire> {
  const res = await fetch(`${baseUrl()}/internal/documents/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  const body = await readJson<{ document: InternalDocumentWire }>(res);
  return body.document;
}

export type { BatchIntegrationParams, InternalDocumentBatchWire };
