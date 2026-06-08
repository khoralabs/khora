import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

const NAV_ITEMS = [
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
] as const;

type SiteNavProps = {
  className?: string;
  linkClassName?: string;
};

export function SiteNav({ className, linkClassName }: SiteNavProps) {
  return (
    <NavigationMenu aria-label="Primary" viewport={false} className={className}>
      <NavigationMenuList className="gap-2 md:gap-4">
        {NAV_ITEMS.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink href={item.href} className={linkClassName}>
              {item.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
