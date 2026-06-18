import { Share2 } from "lucide-react";
import { useState } from "react";

import { SessionAccessList } from "@/components/sessions/session-access-list";
import { ShareSessionDialog } from "@/components/sessions/share-session-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatPhaseLabel, formatSessionDate, type SessionDetail } from "@/lib/sessions-api";

type SessionAccessPanelProps = {
  detail: SessionDetail | null;
  sessionId: string;
  onRefresh: () => void;
};

export function SessionAccessPanel({ detail, sessionId, onRefresh }: SessionAccessPanelProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  if (detail === null) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{formatPhaseLabel(detail.session.phase)}</Badge>
          {detail.session.daysToDeadline !== null ? (
            <Badge variant="outline">{detail.session.daysToDeadline}</Badge>
          ) : null}
          <Badge variant="outline">{detail.session.status}</Badge>
        </div>

        <div className="space-y-3 rounded-lg border bg-background p-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Session topic
            </p>
            <p className="mt-1">{detail.session.topic}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Created {formatSessionDate(detail.session.createdAtMs)}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Access</p>
            {detail.canManage ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                <Share2 />
                Share
              </Button>
            ) : null}
          </div>
          <SessionAccessList
            sessionId={sessionId}
            refreshKey={listRefreshKey}
            onRemoved={() => {
              setListRefreshKey((k) => k + 1);
              onRefresh();
            }}
          />
        </div>
      </div>

      <ShareSessionDialog
        sessionId={sessionId}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onChanged={() => setListRefreshKey((k) => k + 1)}
      />
    </>
  );
}
