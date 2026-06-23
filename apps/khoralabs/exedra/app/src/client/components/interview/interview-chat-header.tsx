import { Lightbulb, Pencil, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SessionViewToggle } from "@/components/exedra/session-view-toggle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { patchSession } from "@/lib/sessions-api";
import { appSectionHeaderClassName } from "@/shell/app-section-header";
import { useMobileChromeLayoutOptional } from "@/shell/mobile-chrome-layout";
import { SidebarCollapseTrigger } from "@/shell/sidebar-collapse-trigger";
import { SidebarSheetTrigger } from "@/shell/sidebar-sheet-trigger";

import type { ThreadKind } from "./thread-chat-types";

type InterviewChatHeaderProps = {
  sessionId: string;
  sessionTopic: string;
  connected: boolean;
  canManage?: boolean;
  onNavigate: (path: string) => void;
  onShare?: () => void;
  onTopicChange?: (topic: string) => void;
  activeThread?: ThreadKind;
  onActiveThreadChange?: (thread: ThreadKind) => void;
  showFacilitationTab?: boolean;
  showInterviewTab?: boolean;
};

function SessionTitleEditor({
  sessionId,
  initialTopic,
  canEdit,
  onSaved,
}: {
  sessionId: string;
  initialTopic: string;
  canEdit: boolean;
  onSaved?: (topic: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTopic);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === initialTopic) {
      setValue(initialTopic);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await patchSession(sessionId, { topic: trimmed });
      onSaved?.(trimmed);
      setEditing(false);
    } catch {
      setValue(initialTopic);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        disabled={saving}
        className="min-w-0 flex-1 bg-transparent font-medium outline-none ring-0 truncate text-center lg:text-left focus:outline-none"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") {
            setValue(initialTopic);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div className="group flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <p className="truncate font-medium text-center lg:text-left">{value}</p>
      {canEdit ? (
        <button
          type="button"
          aria-label="Rename session"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function InterviewChatHeader({
  sessionId,
  sessionTopic,
  connected,
  canManage,
  onNavigate,
  onShare,
  onTopicChange,
  activeThread,
  onActiveThreadChange,
  showFacilitationTab = false,
  showInterviewTab = false,
}: InterviewChatHeaderProps) {
  const mobileLayout = useMobileChromeLayoutOptional();
  const showThreadTabs =
    showFacilitationTab &&
    showInterviewTab &&
    activeThread !== undefined &&
    onActiveThreadChange !== undefined;

  return (
    <div className="border-b">
      <div className={appSectionHeaderClassName("gap-2 px-3 lg:gap-3 lg:px-4")}>
        <SidebarSheetTrigger />
        <SidebarCollapseTrigger />

        <SessionTitleEditor
          sessionId={sessionId}
          initialTopic={sessionTopic}
          canEdit={canManage === true}
          onSaved={onTopicChange}
        />

        {!connected ? (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            Connecting…
          </span>
        ) : null}

        {mobileLayout?.isCompactChrome ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 lg:hidden"
            aria-label="Open beliefs panel"
            onClick={() => mobileLayout.setCanvasOpen(true)}
          >
            <Lightbulb />
          </Button>
        ) : null}

        {canManage && onShare !== undefined ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onShare}>
            <Share2 />
            Share
          </Button>
        ) : null}

        <div className="shrink-0">
          <SessionViewToggle activeView="chat" onNavigate={onNavigate} sessionId={sessionId} />
        </div>
      </div>

      {showThreadTabs ? (
        <div className="px-3 pb-2 lg:px-4">
          <Tabs
            value={activeThread}
            onValueChange={(value) => onActiveThreadChange(value as ThreadKind)}
          >
            <TabsList variant="line">
              <TabsTrigger value="facilitation">Facilitation</TabsTrigger>
              <TabsTrigger value="interview">My interview</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}
