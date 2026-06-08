import type { ComponentProps } from "react";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

type SiteNavProps = {
  className?: string;
};

function NavLink({ className, ...props }: ComponentProps<typeof NavigationMenuLink>) {
  return (
    <NavigationMenuLink
      className={cn(
        "bg-transparent p-0 text-[12px] text-[#F4F4EF]/55 no-underline hover:bg-transparent hover:text-[#F4F4EF]/90 focus:bg-transparent focus:text-[#F4F4EF]/90 data-[active=true]:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

export function SiteNav({ className }: SiteNavProps) {
  return (
    <NavigationMenu aria-label="Primary" viewport={false} className={className}>
      <NavigationMenuList className="gap-2 md:gap-4">
        <NavigationMenuItem>
          <NavLink href="/blog">Blog</NavLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavLink href="/contact">Contact</NavLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
