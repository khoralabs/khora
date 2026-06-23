import { useCallback, useEffect, useRef, useState } from "react";

export function useChatDragDrop(canAcceptFiles: boolean) {
  const chatRootRef = useRef<HTMLDivElement | null>(null);
  const attachmentControlsRef = useRef<{
    add: (files: File[] | FileList) => void;
    clear: () => void;
  } | null>(null);
  const dragDepthRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleAttachmentControlsReady = useCallback(
    (controls: { add: (files: File[] | FileList) => void; clear: () => void }) => {
      attachmentControlsRef.current = controls;
    },
    [],
  );

  useEffect(() => {
    const root = chatRootRef.current;
    if (root === null || !canAcceptFiles) {
      dragDepthRef.current = 0;
      setIsDragActive(false);
      return;
    }

    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragActive(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragActive(false);
      }
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragActive(false);
      if (event.dataTransfer?.files !== undefined && event.dataTransfer.files.length > 0) {
        attachmentControlsRef.current?.add(event.dataTransfer.files);
      }
    };

    root.addEventListener("dragenter", onDragEnter);
    root.addEventListener("dragleave", onDragLeave);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("drop", onDrop);

    const onDragEnd = () => {
      dragDepthRef.current = 0;
      setIsDragActive(false);
    };
    window.addEventListener("dragend", onDragEnd);

    return () => {
      root.removeEventListener("dragenter", onDragEnter);
      root.removeEventListener("dragleave", onDragLeave);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
    };
  }, [canAcceptFiles]);

  return { chatRootRef, isDragActive, attachmentControlsRef, handleAttachmentControlsReady };
}
