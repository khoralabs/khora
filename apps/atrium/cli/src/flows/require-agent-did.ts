export function requireAgentDid(): string {
  const did = process.env.ATRIUM_AGENT_DID?.trim();
  if (did === undefined || did.length === 0) {
    throw new Error("Set ATRIUM_AGENT_DID for this command.");
  }
  return did;
}
