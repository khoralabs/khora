import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "./nav";
import { navigateAdmin, usePathname } from "./use-pathname";

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const isGraphRoute = pathname.startsWith("/admin/graph");

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
        <div className="border-b px-4 py-5">
          <p className="text-lg font-semibold tracking-tight">Khora Admin</p>
          <p className="text-xs text-muted-foreground">Host console</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {ADMIN_NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  navigateAdmin(item.href);
                }}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm md:hidden"
              value={ADMIN_NAV.find((item) => item.match(pathname))?.href ?? "/admin"}
              onChange={(e) => navigateAdmin(e.target.value)}
            >
              {ADMIN_NAV.map((item) => (
                <option key={item.href} value={item.href}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="hidden text-sm text-muted-foreground md:block">
              {ADMIN_NAV.find((item) => item.match(pathname))?.label ?? "Admin"}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await fetch("/admin/api/logout", { method: "POST" });
              window.location.href = "/admin/login";
            }}
          >
            Sign out
          </Button>
        </header>
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isGraphRoute ? "overflow-hidden" : "overflow-auto p-4 md:p-6",
          )}
        >
          {isGraphRoute ? children : <div className="mx-auto w-full max-w-6xl">{children}</div>}
        </main>
      </div>
    </div>
  );
}
