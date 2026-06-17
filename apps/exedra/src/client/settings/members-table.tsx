import { Badge } from "@/components/ui/badge";

type MembersTableProps = {
  members: {
    userId: string;
    registryUserId: string;
    fullName: string | null;
    isCurrentUser: boolean;
    badges?: string[];
    subtitle?: string;
  }[];
};

function memberLabel(member: MembersTableProps["members"][number]): string {
  if (member.fullName !== null && member.fullName.trim().length > 0) {
    return member.fullName;
  }
  return member.registryUserId;
}

export function MembersTable({ members }: MembersTableProps) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No members yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {members.map((member) => (
        <li key={member.userId} className="rounded-md border bg-background px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{memberLabel(member)}</p>
            {member.isCurrentUser ? <Badge variant="secondary">You</Badge> : null}
            {member.badges?.map((badge) => (
              <Badge key={badge} variant="outline">
                {badge}
              </Badge>
            ))}
          </div>
          {member.subtitle !== undefined ? (
            <p className="mt-1 text-xs text-muted-foreground">{member.subtitle}</p>
          ) : null}
          <p className="mt-1 font-mono text-xs text-muted-foreground">{member.userId}</p>
        </li>
      ))}
    </ul>
  );
}
