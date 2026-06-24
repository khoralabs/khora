import type {
  BatchIntegrationParams,
  DocumentIntegrationParams,
} from "@khoralabs/exedra-workflows-process-document/document-processing";
import {
  isContextDocument,
  resolveDocumentMemoryKey,
} from "@khoralabs/exedra-workflows-process-document/document-processing";
import { fetchDocumentBatch, fetchDocumentBytes, patchDocument } from "./document-client.ts";
import { postInternalMemoriesMerge, postInternalMemoriesSearch } from "./exedra-client.ts";
import { expandBatchDocument } from "./expand-batch-document.ts";
import { extractDocumentText } from "./extract-document-text.ts";
import { planDocumentIntegration } from "./plan-document-integration.ts";

function mergeOptions(params: BatchIntegrationParams) {
  return params.orgId !== undefined && params.orgId.length > 0 ? { orgId: params.orgId } : {};
}

function searchOptions(params: BatchIntegrationParams, namespace: string) {
  return {
    namespace,
    ...mergeOptions(params),
  };
}

export async function integrateBatch(params: BatchIntegrationParams): Promise<{ ok: true }> {
  const batch = await fetchDocumentBatch(params.batchId);
  const contextText = (params.contextText ?? batch.contextText).trim();
  const namespace = params.namespace || batch.targetNamespace;

  const fileDocuments = batch.documents.filter(
    (document) => !isContextDocument(document.fileName, document.mimeType),
  );

  const extractions: Array<{ documentId: string; fileName: string; text: string }> = [];
  for (const document of fileDocuments) {
    try {
      const bytes = await fetchDocumentBytes(document.id);
      const text = await extractDocumentText({
        fileName: document.fileName,
        mimeType: document.mimeType,
        bytes,
      });
      extractions.push({ documentId: document.id, fileName: document.fileName, text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await patchDocument(document.id, {
        status: "failed",
        errorMessage: message,
        processedAtMs: Date.now(),
      });
      throw err;
    }
  }

  const siblingKeys: string[] = [];

  for (const extraction of extractions) {
    const integrationParams: DocumentIntegrationParams = {
      userId: params.userId,
      batchId: params.batchId,
      documentId: extraction.documentId,
      fileName: extraction.fileName,
      mimeType:
        fileDocuments.find((document) => document.id === extraction.documentId)?.mimeType ??
        "application/octet-stream",
      chunkText: extraction.text,
      namespace,
      ...(params.orgId !== undefined ? { orgId: params.orgId } : {}),
      contextText,
      siblingSummaries: extractions
        .filter((item) => item.documentId !== extraction.documentId)
        .map((item) => ({
          documentId: item.documentId,
          fileName: item.fileName,
          excerpt: item.text.slice(0, 500),
        })),
    };

    try {
      const search = await postInternalMemoriesSearch({
        userId: params.userId,
        query: extraction.text.slice(0, 500),
        topK: 10,
        ...searchOptions(params, namespace),
      });

      const draft = await expandBatchDocument({ ...integrationParams, namespace });
      const memoryKey = resolveDocumentMemoryKey(params.batchId, extraction.documentId);
      const coldStart = search.hits.length === 0 && siblingKeys.length === 0;

      if (coldStart) {
        await postInternalMemoriesMerge({
          userId: params.userId,
          logicalMemory: {
            key: memoryKey,
            namespace,
            plaintext: draft.plaintext,
          },
          mode: "bootstrap",
          draft,
          ...mergeOptions(params),
        });
      } else {
        const planResult = await planDocumentIntegration({
          content: draft.plaintext,
          userId: params.userId,
          namespace,
        });
        await postInternalMemoriesMerge({
          userId: params.userId,
          logicalMemory: {
            key: memoryKey,
            namespace,
            plaintext: draft.plaintext,
          },
          mode: "plan",
          plan: planResult.plan,
          allowedPeerKeys: [...new Set([...planResult.allowedPeerKeys, ...siblingKeys])],
          ...mergeOptions(params),
        });
      }

      siblingKeys.push(memoryKey);
      await patchDocument(extraction.documentId, {
        status: "ready",
        summary: draft.plaintext.slice(0, 500),
        processedAtMs: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await patchDocument(extraction.documentId, {
        status: "failed",
        errorMessage: message,
        processedAtMs: Date.now(),
      });
      throw err;
    }
  }

  if (fileDocuments.length === 0 && contextText.length > 0) {
    const contextDocument = batch.documents.find((document) =>
      isContextDocument(document.fileName, document.mimeType),
    );
    if (contextDocument !== undefined) {
      const search = await postInternalMemoriesSearch({
        userId: params.userId,
        query: contextText.slice(0, 500),
        topK: 10,
        ...searchOptions(params, namespace),
      });
      const draft = await expandBatchDocument({
        userId: params.userId,
        batchId: params.batchId,
        documentId: contextDocument.id,
        fileName: contextDocument.fileName,
        mimeType: contextDocument.mimeType,
        chunkText: contextText,
        namespace,
        contextText,
      });
      const memoryKey = resolveDocumentMemoryKey(params.batchId, contextDocument.id);
      if (search.hits.length === 0) {
        await postInternalMemoriesMerge({
          userId: params.userId,
          logicalMemory: { key: memoryKey, namespace, plaintext: draft.plaintext },
          mode: "bootstrap",
          draft,
          ...mergeOptions(params),
        });
      } else {
        const planResult = await planDocumentIntegration({
          content: draft.plaintext,
          userId: params.userId,
          namespace,
        });
        await postInternalMemoriesMerge({
          userId: params.userId,
          logicalMemory: { key: memoryKey, namespace, plaintext: draft.plaintext },
          mode: "plan",
          plan: planResult.plan,
          allowedPeerKeys: planResult.allowedPeerKeys,
          ...mergeOptions(params),
        });
      }
      await patchDocument(contextDocument.id, {
        status: "ready",
        summary: draft.plaintext.slice(0, 500),
        processedAtMs: Date.now(),
      });
    }
  }

  return { ok: true };
}
