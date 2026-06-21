const isDev = process.env.NODE_ENV !== "production";

export function track(event: string, props?: Record<string, unknown>): void {
  const payload = { event, ...(props ?? {}) };
  if (isDev) {
    console.debug("[exedra.client]", payload);
    return;
  }

  void fetch("/api/events", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // non-fatal
  });
}
