import {
  Attachment,
  AttachmentPreview,
  Attachments,
  toAttachmentData,
} from "@khoralabs/chat-react/ui";
import { FileText } from "lucide-react";
import { memo } from "react";
import {
  DocumentMetadataHoverCard,
  type DocumentMetadataInfo,
} from "@/components/exedra/document-metadata-hover-card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ChatDocument } from "@/lib/interview-api";

function toDocumentMetadata(document: ChatDocument): DocumentMetadataInfo {
  return {
    fileName: document.fileName,
    mediaType: document.mediaType,
    byteSize: document.byteSize,
    status: document.status,
    ownerName: document.ownerName,
  };
}

type DocumentThumbnailProps = {
  document: ChatDocument;
  sessionId: string;
  onClick: (messageId: string, documentId: string) => void;
};

const DocumentThumbnail = memo(({ document, sessionId, onClick }: DocumentThumbnailProps) => {
  const attachmentData = toAttachmentData({
    id: document.id,
    fileName: document.fileName,
    mediaType: document.mediaType,
    byteSize: document.byteSize,
    url: `/api/sessions/${encodeURIComponent(sessionId)}/documents/${encodeURIComponent(document.id)}`,
  });

  return (
    <DocumentMetadataHoverCard metadata={toDocumentMetadata(document)} side="top">
      <button
        type="button"
        className="block shrink-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onClick(document.messageId, document.id)}
      >
        <Attachment data={attachmentData}>
          <AttachmentPreview />
        </Attachment>
      </button>
    </DocumentMetadataHoverCard>
  );
});

DocumentThumbnail.displayName = "DocumentThumbnail";

type InterviewDocumentsPanelProps = {
  documents: ChatDocument[];
  sessionId: string;
  onDocumentClick: (messageId: string, documentId: string) => void;
};

export function InterviewDocumentsPanel({
  documents,
  sessionId,
  onDocumentClick,
}: InterviewDocumentsPanelProps) {
  if (documents.length === 0) {
    return (
      <Empty className="border border-dashed bg-background/50">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No documents yet</EmptyTitle>
          <EmptyDescription>
            Files you attach in the interview will appear here. Click a thumbnail to jump to the
            message where it was sent.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Attachments className="ml-0 w-full" variant="grid">
      {documents.map((document) => (
        <DocumentThumbnail
          document={document}
          key={document.id}
          sessionId={sessionId}
          onClick={onDocumentClick}
        />
      ))}
    </Attachments>
  );
}
