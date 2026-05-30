import type * as React from "react";
import { useState } from "react";
import { cn } from "../cn.ts";
import { useAdminStats } from "../context";
import { formatRelativeMs, useAdminInactiveMembers } from "../hooks/use-admin-inactive-members.ts";

function reasonLabel(reason: "no_post_7d" | "silent_heartbeat_7d"): string {
  if (reason === "no_post_7d") return "No post 7d+";
  return "Silent heartbeat 7d+";
}

export function AdminStatsInactiveMembers({
  className,
  ...props
}: React.ComponentProps<"section">) {
  const { baseUrl } = useAdminStats();
  const [inactiveDays, setInactiveDays] = useState(7);
  const { data, isLoading, error } = useAdminInactiveMembers(baseUrl, inactiveDays);

  return (
    <section
      data-slot="admin-stats-inactive-members"
      className={cn("space-y-4", className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="inactive-days" className="text-sm text-muted-foreground">
          Inactive threshold (days)
        </label>
        <input
          id="inactive-days"
          type="number"
          min={1}
          max={90}
          value={inactiveDays}
          onChange={(e) => setInactiveDays(Number.parseInt(e.target.value, 10) || 7)}
          className="w-16 rounded-md border bg-background px-2 py-1 text-sm"
        />
      </div>
      {isLoading && <p data-slot="admin-stats-loading">Loading…</p>}
      {error !== null && <p data-slot="admin-stats-error">{error}</p>}
      {!isLoading &&
        error === null &&
        data !== null &&
        (data.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inactive members.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Member</th>
                  <th className="pb-2 pr-4 font-medium">Last post</th>
                  <th className="pb-2 pr-4 font-medium">Last status</th>
                  <th className="pb-2 font-medium">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.did} className="border-t">
                    <td className="py-2 pr-4 font-mono text-xs">{member.username ?? member.did}</td>
                    <td className="py-2 pr-4">{formatRelativeMs(member.lastPostAtMs)}</td>
                    <td className="py-2 pr-4">{formatRelativeMs(member.lastStatusAtMs)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {member.reasons.map((reason) => (
                          <span key={reason} className="rounded-full border px-2 py-0.5 text-xs">
                            {reasonLabel(reason)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
