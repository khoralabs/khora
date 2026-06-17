import { useCallback, useEffect, useRef, useState } from "react";

import { EntityAvatar } from "@/components/entity-avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

type AvatarUploadFieldProps = {
  name: string;
  avatarUrl: string | null;
  disabled?: boolean;
  onFileSelected: (file: File | null) => void;
};

export function AvatarUploadField({
  name,
  avatarUrl,
  disabled = false,
  onFileSelected,
}: AvatarUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    if (file === null) {
      setPreviewUrl(null);
      onFileSelected(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    onFileSelected(file);
  }

  function handleRemove() {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileSelected(null);
  }

  const displayUrl = previewUrl ?? avatarUrl;

  return (
    <Field>
      <FieldLabel>Avatar</FieldLabel>
      <div className="flex items-center gap-4">
        <EntityAvatar name={name} avatarUrl={displayUrl} size="lg" />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Upload image
          </Button>
          {(displayUrl !== null || previewUrl !== null) && !disabled ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled}
          onChange={handleFileChange}
        />
      </div>
      <FieldDescription>PNG, JPG, or WebP up to 2 MB.</FieldDescription>
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
