export function readConsoleRootToken(): string | undefined {
  const token = process.env.KHORA_CONSOLE_ROOT_TOKEN?.trim();
  if (token === undefined || token.length < 16) return undefined;
  return token;
}

export function readConsoleAuthKind(): "root-token" {
  const kind = process.env.KHORA_CONSOLE_AUTH?.trim().toLowerCase() ?? "root-token";
  if (kind !== "root-token") {
    throw new Error(`KHORA_CONSOLE_AUTH=${kind} is not supported yet; use root-token.`);
  }
  return kind;
}
