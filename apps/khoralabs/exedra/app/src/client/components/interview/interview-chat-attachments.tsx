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
import { sessionDocumentDownloadUrl } from "@/lib/documents-api";
import type { ChatMessageAttachment } from "@/lib/interview-api";

function guessMimeType(fileName: string): string {
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

function toMessageAttachmentData(
  attachment: ChatMessageAttachment,
  sessionId: string,
): AttachmentData {
  return {
    type: "file",
    id: attachment.id,
    filename: attachment.fileName,
    mediaType: attachment.mediaType ?? guessMimeType(attachment.fileName),
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
};

const MessageAttachmentItem = memo(({ attachment }: MessageAttachmentItemProps) => (
  <a
    className="block shrink-0"
    href={attachment.type === "file" ? attachment.url : undefined}
    rel="noreferrer"
    target="_blank"
  >
    <Attachment data={attachment}>
      <AttachmentPreview />
    </Attachment>
  </a>
));

MessageAttachmentItem.displayName = "MessageAttachmentItem";

export function UserMessageAttachments({
  attachments,
  sessionId,
}: {
  attachments: ChatMessageAttachment[];
  sessionId: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <Attachments className="mb-2" variant="grid">
      {attachments.map((attachment) => (
        <MessageAttachmentItem
          attachment={toMessageAttachmentData(attachment, sessionId)}
          key={attachment.id}
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
