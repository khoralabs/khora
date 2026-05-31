export type AdminNavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Overview",
    match: (pathname) => pathname === "/admin" || pathname === "/admin/",
  },
  {
    href: "/admin/hosts",
    label: "Hosts",
    match: (pathname) =>
      pathname === "/admin/hosts" ||
      pathname === "/admin/hosts/" ||
      pathname.startsWith("/admin/hosts/"),
  },
  {
    href: "/admin/lookup",
    label: "Lookup",
    match: (pathname) => pathname.startsWith("/admin/lookup"),
  },
];

export function parseHostDetailSlug(pathname: string): string | null {
  const prefix = "/admin/hosts/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const slug = pathname.slice(prefix.length).split("/")[0]?.trim();
  return slug !== undefined && slug.length > 0 ? slug : null;
}

export function navSectionLabel(pathname: string): string {
  const slug = parseHostDetailSlug(pathname);
  if (slug !== null) {
    return `Host: ${slug}`;
  }
  return ADMIN_NAV.find((item) => item.match(pathname))?.label ?? "Admin";
}
