import type { ComponentProps } from "react";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { ASSETS } from "@/lib/asset-urls";
import { cn } from "@/lib/utils";

const DISCORD_INVITE_URL = "https://discord.gg/B2gp9r4H3";

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
      <NavigationMenuList className="items-center gap-2 md:gap-4">
        <NavigationMenuItem>
          <NavLink href="/blog">Blog</NavLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavLink href="/contact">Contact</NavLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join Khora on Discord"
          >
            <img
              src={ASSETS.discord}
              alt=""
              width={15}
              height={15}
              className="h-5 w-5 invert opacity-55 transition-opacity hover:opacity-90 focus-visible:opacity-90 focus-visible:outline-none"
            />
          </a>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
