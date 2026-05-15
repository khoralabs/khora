export function formatExpiresTurn(n: number): string {
  return n === 0 ? "0 (off)" : String(n);
}

export function formatRelayMs(n: number): string {
  return n === 0 ? "0 (off)" : String(n);
}
