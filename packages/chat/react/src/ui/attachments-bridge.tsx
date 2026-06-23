import type { FileUIPart } from "ai";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect } from "react";
import type { DisplayAttachment } from "../adapters.ts";
import { guessAttachmentMimeType } from "../adapters.ts";
import {
  Attachment,
  type AttachmentData,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "./ai-elements/attachments.tsx";
import { PromptInputHeader, usePromptInputAttachments } from "./ai-elements/prompt-input.tsx";

export function toAttachmentData(
  attachment: DisplayAttachment,
  resolveUrl?: (attachment: DisplayAttachment) => string | undefined,
): AttachmentData {
  return {
    type: "file",
    id: attachment.id,
    filename: attachment.fileName,
    mediaType: attachment.mediaType ?? guessAttachmentMimeType(attachment.fileName),
    url: attachment.url ?? resolveUrl?.(attachment) ?? "",
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

export function PromptComposerAttachments() {
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

export function MessageAttachments({
  attachments,
  resolveUrl,
  children,
}: {
  attachments: DisplayAttachment[];
  resolveUrl?: (attachment: DisplayAttachment) => string | undefined;
  children: (attachment: AttachmentData) => ReactNode;
}) {
  if (attachments.length === 0) return null;

  return (
    <Attachments className="mb-2" variant="grid">
      {attachments.map((attachment) => (
        <div data-attachment-id={attachment.id} key={attachment.id}>
          {children(toAttachmentData(attachment, resolveUrl))}
        </div>
      ))}
    </Attachments>
  );
}

export type { AttachmentData, FileUIPart };
