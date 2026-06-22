import type { ReactNode } from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { DocumentProcessingStatus } from "@/lib/documents-api";
import { cn } from "@/lib/utils";

export type DocumentMetadataInfo = {
  fileName: string;
  mediaType?: string;
  byteSize?: number;
  status?: DocumentProcessingStatus;
  ownerName?: string;
};

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMediaTypeLabel(mediaType: string): string {
  const subtype = mediaType.split("/")[1]?.trim();
  if (subtype === undefined || subtype.length === 0) return mediaType;
  return subtype.replace(/[-_.]+/g, " ").toUpperCase();
}

function formatIntegrationStatus(status: DocumentProcessingStatus): string {
  switch (status) {
    case "accepted":
      return "Queued for integration";
    case "processing":
      return "Integrating into knowledge";
    case "ready":
      return "Integrated into knowledge";
    case "failed":
      return "Integration failed";
    default:
      return status;
  }
}

type MetadataRowProps = {
  label: string;
  value: string;
  valueClassName?: string;
};

function MetadataRow({ label, value, valueClassName }: MetadataRowProps) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm text-foreground", valueClassName)}>{value}</dd>
    </div>
  );
}

type DocumentMetadataHoverCardProps = {
  metadata: DocumentMetadataInfo;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

export function DocumentMetadataHoverCard({
  metadata,
  children,
  side = "bottom",
  align = "start",
}: DocumentMetadataHoverCardProps) {
  const { fileName, mediaType, byteSize, status, ownerName } = metadata;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={side} align={align} className="w-72 p-3">
        <dl className="space-y-2.5">
          <MetadataRow label="Filename" value={fileName} valueClassName="break-all font-medium" />
          {byteSize !== undefined ? (
            <MetadataRow label="Size" value={formatByteSize(byteSize)} />
          ) : null}
          {mediaType !== undefined && mediaType.length > 0 ? (
            <MetadataRow label="Type" value={formatMediaTypeLabel(mediaType)} />
          ) : null}
          {ownerName !== undefined && ownerName.length > 0 ? (
            <MetadataRow label="Owner" value={ownerName} />
          ) : null}
          {status !== undefined ? (
            <MetadataRow label="Knowledge" value={formatIntegrationStatus(status)} />
          ) : null}
        </dl>
      </HoverCardContent>
    </HoverCard>
  );
}
