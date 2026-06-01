import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
  { href: "/skills", label: "Skills" },
] as const;

const navLinkClass = {
  dark: cn(
    "inline-flex h-auto w-max items-center rounded-none bg-transparent p-0 text-sm text-[#F4F4EF] no-underline shadow-none",
    "transition-opacity hover:bg-transparent hover:text-[#F4F4EF] hover:opacity-75",
    "focus:bg-transparent focus:text-[#F4F4EF] focus-visible:ring-0",
    "data-[active=true]:bg-transparent data-[active=true]:text-[#F4F4EF]",
    "md:text-[15px]",
  ),
  light: cn(
    "inline-flex h-auto w-max items-center rounded-none bg-transparent p-0 text-[12px] text-[#838383] no-underline shadow-none",
    "transition-opacity hover:bg-transparent hover:text-[#838383] hover:opacity-75",
    "focus:bg-transparent focus:text-[#838383] focus-visible:ring-0",
    "data-[active=true]:bg-transparent data-[active=true]:text-[#838383]",
  ),
};

type SiteNavProps = {
  variant?: keyof typeof navLinkClass;
  className?: string;
};

export function SiteNav({ variant = "dark", className }: SiteNavProps) {
  return (
    <NavigationMenu aria-label="Primary" viewport={false} className={className}>
      <NavigationMenuList className="gap-8 md:gap-10">
        {NAV_ITEMS.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink href={item.href} className={navLinkClass[variant]}>
              {item.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
