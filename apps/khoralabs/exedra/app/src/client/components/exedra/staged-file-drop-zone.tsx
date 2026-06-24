import { Upload } from "lucide-react";
import { useCallback, useState } from "react";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  addStagedFiles,
  MAX_STAGED_FILES,
  type PendingFile,
  removeStagedAttachment,
} from "@/lib/staged-file-attachments";
import { cn } from "@/lib/utils";

type StagedFileDropZoneProps = {
  attachments: PendingFile[];
  onAttachmentsChange: (attachments: PendingFile[]) => void;
  disabled?: boolean;
  description?: string;
  maxFiles?: number;
};

export function StagedFileDropZone({
  attachments,
  onAttachmentsChange,
  disabled = false,
  description = "Add files the agent should use as session context.",
  maxFiles = MAX_STAGED_FILES,
}: StagedFileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      onAttachmentsChange(addStagedFiles(attachments, files, maxFiles));
    },
    [attachments, maxFiles, onAttachmentsChange],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      onAttachmentsChange(removeStagedAttachment(attachments, id));
    },
    [attachments, onAttachmentsChange],
  );

  return (
    <div className="space-y-3">
      <label
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30",
          disabled && "pointer-events-none opacity-60",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (disabled) return;
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (disabled || event.dataTransfer.files.length === 0) return;
          addFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-sm text-muted-foreground">
          Drag files here or{" "}
          <span className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline">
            browse
            <input
              type="file"
              multiple
              className="sr-only"
              disabled={disabled || attachments.length >= maxFiles}
              onChange={(event) => {
                if (event.target.files !== null) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </span>
        </p>
        <p className="text-xs text-muted-foreground">Up to {maxFiles} files</p>
      </label>

      {attachments.length > 0 ? (
        <Attachments className="w-full" variant="grid">
          {attachments.map((attachment) => (
            <Attachment
              data={attachment}
              key={attachment.id}
              onRemove={disabled ? undefined : () => removeAttachment(attachment.id)}
            >
              <AttachmentPreview />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      ) : null}
    </div>
  );
}
