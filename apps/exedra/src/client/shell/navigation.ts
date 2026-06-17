export type ExedraEntrypoint = "main" | "interview" | "graph";

export function entrypointForPath(pathname: string): ExedraEntrypoint {
  if (/^\/sessions\/[^/]+\/interview\/?$/.test(pathname)) return "interview";
  if (/^\/sessions\/[^/]+\/graph\/?$/.test(pathname)) return "graph";
  if (/^\/teams\/[^/]+\/graph\/?$/.test(pathname)) return "graph";
  if (/^\/me\/graph\/?$/.test(pathname)) return "graph";
  return "main";
}

export function navigateExedra(path: string, currentEntrypoint: ExedraEntrypoint): void {
  const target = entrypointForPath(path);
  if (target !== currentEntrypoint) {
    window.location.href = path;
    return;
  }
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
