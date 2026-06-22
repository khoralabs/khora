import { memo, useCallback, useEffect } from "react";

import {
  Attachment,
  type AttachmentData,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  PromptInputHeader,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  DocumentMetadataHoverCard,
  type DocumentMetadataInfo,
} from "@/components/exedra/document-metadata-hover-card";
import { sessionDocumentDownloadUrl } from "@/lib/documents-api";
import type { ChatMessageAttachment } from "@/lib/interview-api";

export function guessAttachmentMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "json":
      return "application/json";
    case "mp4":
      return "video/mp4";
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

export function toMessageAttachmentData(
  attachment: ChatMessageAttachment,
  sessionId: string,
): AttachmentData {
  return {
    type: "file",
    id: attachment.id,
    filename: attachment.fileName,
    mediaType: attachment.mediaType ?? guessAttachmentMimeType(attachment.fileName),
    url: attachment.url ?? sessionDocumentDownloadUrl(sessionId, attachment.id),
  };
}

type PromptAttachmentItemProps = {
  attachment: AttachmentData;
  onRemove: (id: string) => void;
};

const PromptAttachmentItem = memo(({ attachment, onRemove }: PromptAttachmentItemProps) => {
  const handleRemove = useCallback(() => onRemove(attachment.id), [onRemove, attachment.id]);

  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
});

PromptAttachmentItem.displayName = "PromptAttachmentItem";

export function InterviewPromptAttachments() {
  const attachments = usePromptInputAttachments();
  const handleRemove = useCallback(
    (id: string) => {
      attachments.remove(id);
    },
    [attachments],
  );

  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader>
      <Attachments className="w-full" variant="grid">
        {attachments.files.map((file) => (
          <PromptAttachmentItem attachment={file} key={file.id} onRemove={handleRemove} />
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

type MessageAttachmentItemProps = {
  attachment: AttachmentData;
  metadata: DocumentMetadataInfo;
};

const MessageAttachmentItem = memo(({ attachment, metadata }: MessageAttachmentItemProps) => (
  <DocumentMetadataHoverCard metadata={metadata} side="top">
    <a
      className="block shrink-0 rounded-lg"
      data-attachment-id={attachment.id}
      href={attachment.type === "file" ? attachment.url : undefined}
      rel="noreferrer"
      target="_blank"
    >
      <Attachment data={attachment}>
        <AttachmentPreview />
      </Attachment>
    </a>
  </DocumentMetadataHoverCard>
));

MessageAttachmentItem.displayName = "MessageAttachmentItem";

export function UserMessageAttachments({
  attachments,
  sessionId,
  ownerName,
}: {
  attachments: ChatMessageAttachment[];
  sessionId: string;
  ownerName?: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <Attachments className="mb-2" variant="grid">
      {attachments.map((attachment) => (
        <MessageAttachmentItem
          attachment={toMessageAttachmentData(attachment, sessionId)}
          key={attachment.id}
          metadata={{
            fileName: attachment.fileName,
            mediaType: attachment.mediaType,
            byteSize: attachment.byteSize,
            status: attachment.status,
            ownerName,
          }}
        />
      ))}
    </Attachments>
  );
}

export function PromptInputAttachmentBridge({
  onControlsReady,
}: {
  onControlsReady: (controls: {
    add: (files: File[] | FileList) => void;
    clear: () => void;
  }) => void;
}) {
  const attachments = usePromptInputAttachments();

  useEffect(() => {
    onControlsReady({ add: attachments.add, clear: attachments.clear });
  }, [attachments.add, attachments.clear, onControlsReady]);

  return null;
}
