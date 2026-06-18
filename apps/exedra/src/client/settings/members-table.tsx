import type { AccountRow, OrgMemberContext, TeamMemberContext } from "@shared/accounts/row";

import {
  AccountItem,
  AccountItemBadges,
  AccountItemContent,
  AccountItemDescription,
  AccountItemMedia,
  AccountItemTitle,
} from "@/components/account/account-item";
import { ItemGroup } from "@/components/ui/item";

type MembersTableProps = {
  members: AccountRow<TeamMemberContext | OrgMemberContext>[];
  onMemberClick?: (userId: string) => void;
};

export function MembersTable({ members, onMemberClick }: MembersTableProps) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No members yet.</p>;
  }

  return (
    <ItemGroup className="gap-2">
      {members.map((row) => {
        const adminBadges = row.context.isAdmin ? (["Admin"] as const) : [];
        const teamsDescription =
          row.context.kind === "org_member" && row.context.teamNames.length > 0
            ? `Teams: ${row.context.teamNames.join(", ")}`
            : null;

        const content = (
          <>
            <AccountItemMedia />
            <AccountItemContent>
              <AccountItemTitle />
              {adminBadges.length > 0 ? <AccountItemBadges badges={adminBadges} /> : null}
              {teamsDescription !== null ? (
                <AccountItemDescription>{teamsDescription}</AccountItemDescription>
              ) : null}
            </AccountItemContent>
          </>
        );

        if (onMemberClick === undefined) {
          return (
            <AccountItem
              key={row.account.userId}
              account={row.account}
              isCurrentUser={row.isCurrentUser}
              variant="outline"
              size="sm"
            >
              {content}
            </AccountItem>
          );
        }

        return (
          <AccountItem
            key={row.account.userId}
            account={row.account}
            isCurrentUser={row.isCurrentUser}
            variant="outline"
            size="sm"
            asChild
          >
            <button
              type="button"
              className="w-full min-w-0 text-left transition-colors hover:bg-accent"
              onClick={() => onMemberClick(row.account.userId)}
            >
              {content}
            </button>
          </AccountItem>
        );
      })}
    </ItemGroup>
  );
}
