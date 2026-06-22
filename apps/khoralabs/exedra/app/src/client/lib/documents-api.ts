export type DocumentProcessingStatus = "accepted" | "processing" | "ready" | "failed";

export type UploadedSessionDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  memoryKey: string;
  status: DocumentProcessingStatus;
  summary: string;
  contentHash: string;
  batchId?: string;
};

export type ContributedDocument = UploadedSessionDocument & {
  targetNamespace: string;
  errorMessage: string | null;
  processedAtMs: number | null;
  createdAtMs: number;
};

export type DocumentGrantResource = {
  type: string;
  id: string;
};

export type DocumentBatch = {
  batchId: string;
  contextText: string;
  status: DocumentProcessingStatus;
  targetNamespace: string;
  grantResource: DocumentGrantResource;
  orgId: string | null;
  teamId: string | null;
  documents: ContributedDocument[];
};

export type ContributeKnowledgeOptions = {
  files?: File[];
  contextText?: string;
  namespace: string;
  orgId?: string;
  teamId?: string;
  sessionId?: string;
};

export async function uploadSessionDocument(
  sessionId: string,
  file: File,
): Promise<UploadedSessionDocument> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/documents`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const body = (await response.json()) as {
    document?: UploadedSessionDocument;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Document upload failed");
  }

  if (body.document === undefined) {
    throw new Error("Document upload failed");
  }

  return body.document;
}

export async function contributeKnowledge(
  options: ContributeKnowledgeOptions,
): Promise<DocumentBatch> {
  const formData = new FormData();
  formData.set("namespace", options.namespace);
  if (options.orgId !== undefined) formData.set("orgId", options.orgId);
  if (options.teamId !== undefined) formData.set("teamId", options.teamId);
  if (options.sessionId !== undefined) formData.set("sessionId", options.sessionId);
  if (options.contextText !== undefined && options.contextText.length > 0) {
    formData.set("contextText", options.contextText);
  }
  for (const file of options.files ?? []) {
    formData.append("files", file);
  }

  const response = await fetch("/api/documents/contribute", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const body = (await response.json()) as {
    batch?: DocumentBatch;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Knowledge contribution failed");
  }

  if (body.batch === undefined) {
    throw new Error("Knowledge contribution failed");
  }

  return body.batch;
}

export async function fetchDocumentBatch(batchId: string): Promise<DocumentBatch> {
  const response = await fetch(`/api/documents/batches/${encodeURIComponent(batchId)}`, {
    credentials: "include",
  });

  const body = (await response.json()) as {
    batch?: DocumentBatch;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Failed to fetch batch status");
  }

  if (body.batch === undefined) {
    throw new Error("Failed to fetch batch status");
  }

  return body.batch;
}

export function sessionDocumentDownloadUrl(sessionId: string, documentId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/documents/${encodeURIComponent(documentId)}`;
}
