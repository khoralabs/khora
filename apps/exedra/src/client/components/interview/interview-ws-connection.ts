export function closeWebSocket(ws: WebSocket | null): void {
  if (ws === null) return;
  ws.onopen = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.onmessage = null;
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close();
  }
}

export function waitForWebSocketOpen(ws: WebSocket): Promise<WebSocket> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  if (ws.readyState === WebSocket.CLOSED) {
    return Promise.reject(new Error("Connection closed"));
  }
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve(ws);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Connection failed"));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Connection closed"));
    };
    const cleanup = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
  });
}
