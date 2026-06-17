import { useCallback, useEffect, useId, useRef, useState } from "react";

import { EntityAvatar } from "@/components/entity-avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type AvatarUploadFieldProps = {
  name: string;
  avatarUrl: string | null;
  disabled?: boolean;
  onFileSelected: (file: File | null) => void;
};

function hasImageFiles(dataTransfer: DataTransfer | null): boolean {
  if (dataTransfer === null) return false;
  if (
    [...dataTransfer.items].some((item) => item.kind === "file" && item.type.startsWith("image/"))
  ) {
    return true;
  }
  return dataTransfer.types.includes("Files");
}

function firstImageFile(dataTransfer: DataTransfer | null): File | null {
  if (dataTransfer === null) return null;
  const file = [...dataTransfer.files].find((item) => item.type.startsWith("image/"));
  return file ?? null;
}

export function AvatarUploadField({
  name,
  avatarUrl,
  disabled = false,
  onFileSelected,
}: AvatarUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const applyFile = useCallback(
    (file: File | null) => {
      const previous = previewUrlRef.current;
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      if (file === null) {
        previewUrlRef.current = null;
        setPreviewUrl(null);
        onFileSelected(null);
        return;
      }
      const next = URL.createObjectURL(file);
      previewUrlRef.current = next;
      setPreviewUrl(next);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    applyFile(event.target.files?.[0] ?? null);
  }

  function handleRemove() {
    if (previewUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileSelected(null);
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled || !hasImageFiles(event.dataTransfer)) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled || !hasImageFiles(event.dataTransfer)) return;
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const file = firstImageFile(event.dataTransfer);
    if (file !== null) {
      applyFile(file);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const displayUrl = previewUrl ?? avatarUrl;

  return (
    <Field>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: avatar file drop zone */}
      <div
        className={cn(
          "rounded-lg border border-dashed p-4 transition-colors",
          !disabled && "hover:border-primary/40 hover:bg-muted/40",
          isDragging && "border-primary bg-primary/5",
          disabled && "opacity-50",
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <label
          htmlFor={disabled ? undefined : inputId}
          className={cn("flex cursor-pointer flex-col gap-3", disabled && "cursor-not-allowed")}
        >
          <span className="text-sm font-medium">Avatar</span>
          <div className="flex items-center gap-4">
            <EntityAvatar name={name} avatarUrl={displayUrl} size="lg" />
            <span className="text-sm text-muted-foreground">
              Drag and drop an image here, or click to browse.
            </span>
          </div>
          <FieldDescription className="mt-0">PNG, JPG, or WebP up to 2 MB.</FieldDescription>
        </label>

        {(displayUrl !== null || previewUrl !== null) && !disabled ? (
          <div className="mt-3">
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
              Remove
            </Button>
          </div>
        ) : null}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled}
          onChange={handleFileChange}
        />
      </div>
    </Field>
  );
}

export function useAvatarPendingFile() {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeRequested, setRemoveRequested] = useState(false);

  const selectFile = useCallback((file: File | null) => {
    if (file === null) {
      setPendingFile(null);
      setRemoveRequested(true);
      return;
    }
    setPendingFile(file);
    setRemoveRequested(false);
  }, []);

  const resetPending = useCallback(() => {
    setPendingFile(null);
    setRemoveRequested(false);
  }, []);

  return { pendingFile, removeRequested, selectFile, resetPending };
}
