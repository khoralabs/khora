import type * as React from "react";
import { cn } from "../cn.ts";
import { AdminStatsProvider, type AdminStatsProviderProps } from "../context";

export type AdminStatsRootProps = React.ComponentProps<"div"> &
  Omit<AdminStatsProviderProps, "children">;

export function AdminStatsRoot({
  baseUrl,
  fetchImpl,
  selectedCellId,
  defaultSelectedCellId,
  onSelectedCellIdChange,
  className,
  children,
  ...props
}: AdminStatsRootProps) {
  return (
    <AdminStatsProvider
      baseUrl={baseUrl}
      fetchImpl={fetchImpl}
      selectedCellId={selectedCellId}
      defaultSelectedCellId={defaultSelectedCellId}
      onSelectedCellIdChange={onSelectedCellIdChange}
    >
      <div data-slot="admin-stats-root" className={cn(className)} {...props}>
        {children}
      </div>
    </AdminStatsProvider>
  );
}
