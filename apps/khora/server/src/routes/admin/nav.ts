export type AdminNavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin/",
    label: "Overview",
    match: (pathname) => pathname === "/admin" || pathname === "/admin/",
  },
  {
    href: "/admin/network",
    label: "Network",
    match: (pathname) => pathname.startsWith("/admin/network"),
  },
  {
    href: "/admin/infrastructure",
    label: "Infrastructure",
    match: (pathname) => pathname.startsWith("/admin/infrastructure"),
  },
  {
    href: "/admin/operations",
    label: "Operations",
    match: (pathname) => pathname.startsWith("/admin/operations"),
  },
  {
    href: "/admin/registry",
    label: "Registry",
    match: (pathname) => pathname.startsWith("/admin/registry"),
  },
  {
    href: "/admin/lookup",
    label: "Lookup",
    match: (pathname) => pathname.startsWith("/admin/lookup"),
  },
];
