export function parseActiveSessionId(pathname: string): string | null {
  const interviewMatch = /^\/sessions\/([^/]+)\/interview\/?$/.exec(pathname);
  if (interviewMatch?.[1] !== undefined) return interviewMatch[1];

  const graphMatch = /^\/sessions\/([^/]+)\/graph\/?$/.exec(pathname);
  if (graphMatch?.[1] !== undefined) return graphMatch[1];

  const sessionMatch = /^\/sessions\/([^/]+)\/?$/.exec(pathname);
  if (sessionMatch?.[1] !== undefined && sessionMatch[1] !== "new") return sessionMatch[1];

  return null;
}

export function parseInterviewSessionId(pathname: string): string | null {
  const match = /^\/sessions\/([^/]+)\/interview\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export function parseSessionGraphId(pathname: string): string | null {
  const match = /^\/sessions\/([^/]+)\/graph\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export function parseActiveTeamGraphId(pathname: string): string | null {
  const match = /^\/teams\/([^/]+)\/graph\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export function isPersonalGraphPath(pathname: string): boolean {
  return /^\/me\/graph\/?$/.test(pathname);
}

export function isNewSessionPath(pathname: string): boolean {
  return /^\/sessions\/new\/?$/.test(pathname);
}

export function isSessionInterviewPath(pathname: string): boolean {
  return /^\/sessions\/([^/]+)\/interview\/?$/.test(pathname);
}
