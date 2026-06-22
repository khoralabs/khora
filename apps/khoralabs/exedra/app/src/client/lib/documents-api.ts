export type UploadedSessionDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  memoryKey: string;
  status: "accepted" | "processing" | "ready" | "failed";
  summary: string;
  contentHash: string;
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

export function sessionDocumentDownloadUrl(sessionId: string, documentId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/documents/${encodeURIComponent(documentId)}`;
}
