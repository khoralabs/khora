import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
type JsonlStringLine = {
  memory_id: string;
  source_key: string;
  kind: "string";
  string: string;
};

type LogEntry =
  | { id: string; kind: "line"; line: JsonlStringLine }
  | { id: string; kind: "line_raw"; raw: string }
  | { id: string; kind: "done"; result: unknown };

export function NegotiationDevDrawer(props: {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired when the server sends a terminal `t: "done"` with the run result. */
  onRunFinished?: (result: unknown) => void;
}) {
  const { runId, open, onOpenChange, onRunFinished } = props;
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [rawJsonl, setRawJsonl] = useState(false);
  const [wsState, setWsState] = useState<"idle" | "connecting" | "open" | "error" | "closed">("idle");
  const [errText, setErrText] = useState<string | null>(null);

  useEffect(() => {
    if (!open || runId === null) {
      return;
    }
    setEntries([]);
    setErrText(null);
    setWsState("connecting");
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/api/negotiation/ws?runId=${encodeURIComponent(runId)}`;
    const ws = new WebSocket(url);
    let seq = 0;
    const nextId = () => `${runId}-${++seq}`;
    ws.onopen = () => {
      setWsState("open");
    };
    ws.onerror = () => {
      setWsState("error");
      setErrText("WebSocket error (is the dev server running?)");
    };
    ws.onclose = () => {
      setWsState("closed");
    };
    ws.onmessage = (ev) => {
      const text = String(ev.data);
      try {
        const msg = JSON.parse(text) as {
          t?: string;
          line?: JsonlStringLine;
          raw?: string;
          result?: unknown;
        };
        if (msg.t === "line" && msg.line !== undefined) {
          const line: JsonlStringLine = msg.line;
          setEntries((prev) => [...prev, { id: nextId(), kind: "line", line }]);
        } else if (msg.t === "line" && typeof msg.raw === "string") {
          const raw: string = msg.raw;
          setEntries((prev) => [...prev, { id: nextId(), kind: "line_raw", raw }]);
        } else if (msg.t === "done") {
          const doneResult: unknown = msg.result;
          setEntries((prev) => [
            ...prev,
            { id: nextId(), kind: "done", result: doneResult },
          ]);
          onRunFinished?.(doneResult);
        } else {
          setEntries((prev) => [
            ...prev,
            { id: nextId(), kind: "line_raw", raw: text },
          ]);
        }
      } catch {
        setEntries((prev) => [...prev, { id: nextId(), kind: "line_raw", raw: text }]);
      }
    };
    return () => {
      ws.close();
    };
  }, [open, runId, onRunFinished]);

  const body = useMemo(() => {
    if (runId === null) {
      return null;
    }
    if (errText !== null) {
      return <p className="text-destructive text-sm">{errText}</p>;
    }
    if (rawJsonl) {
      return (
        <ul className="text-muted-foreground max-h-[min(70vh,32rem)] space-y-1 overflow-y-auto font-mono text-xs">
          {entries.map((e) => (
            <li key={e.id}>
              {e.kind === "line" && (
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(e.line)}
                </pre>
              )}
              {e.kind === "line_raw" && <pre className="whitespace-pre-wrap break-words">{e.raw}</pre>}
              {e.kind === "done" && (
                <pre className="whitespace-pre-wrap break-words text-foreground">
                  {JSON.stringify({ t: "done", result: e.result }, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul className="text-foreground max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto text-sm">
        {entries.map((e) => (
          <li key={e.id} className="border-b border-border pb-3 last:border-0">
            {e.kind === "line" && (
              <>
                <p className="text-muted-foreground text-xs font-mono">{e.line.source_key}</p>
                <p className="mt-1 leading-relaxed whitespace-pre-wrap">{e.line.string}</p>
              </>
            )}
            {e.kind === "line_raw" && (
              <pre className="text-muted-foreground text-xs whitespace-pre-wrap">{e.raw}</pre>
            )}
            {e.kind === "done" && (
              <>
                <p className="text-primary font-medium">Result</p>
                <pre className="text-muted-foreground mt-1 text-xs">
                  {JSON.stringify(e.result, null, 2)}
                </pre>
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }, [entries, errText, rawJsonl, runId]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="data-[vaul-drawer-direction=right]:!w-full data-[vaul-drawer-direction=right]:!max-w-xl"
        data-testid="negotiation-dev-drawer"
      >
        <DrawerHeader>
          <DrawerTitle>Live negotiation (developer)</DrawerTitle>
          <DrawerDescription className="font-mono text-xs break-all">
            {runId !== null ? `run: ${runId} · ${wsState}` : "No run"}
          </DrawerDescription>
        </DrawerHeader>
        <div className="border-b border-border px-4 pb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="raw-jsonl"
              checked={rawJsonl}
              onChange={(e) => setRawJsonl(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="raw-jsonl" className="text-sm font-normal">
              Raw JSONL lines
            </Label>
          </div>
        </div>
        <div className="px-4 pb-4">{body}</div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
