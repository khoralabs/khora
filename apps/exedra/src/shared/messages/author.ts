export type MessageAuthor = {
  did: string;
  kind: "user" | "org_agent";
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

export function orgAgentDisplayName(orgName: string): string {
  return `${orgName} via Agent`;
}
