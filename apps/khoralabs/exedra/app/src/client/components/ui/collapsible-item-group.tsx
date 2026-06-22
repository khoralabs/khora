import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  type ComponentProps,
  Children,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ItemGroup } from "@/components/ui/item";
import { cn } from "@/lib/utils";

type CollapsibleItemGroupProps = Omit<ComponentProps<typeof Collapsible>, "open" | "onOpenChange"> & {
  itemCount?: number | `> ${number}` | `${number} ${string}`;
  /** When true, shows `itemCount` even while the group is expanded. */
  alwaysShowItemCount?: boolean;
};

function CollapsibleItemGroupTitle({ children }: { children: string }) {
  return children;
}

function CollapsibleItemGroupActions({ children }: PropsWithChildren) {
  return children;
}

function CollapsibleItemGroupContent({
  children,
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      {...props}
    >
      {children}
    </CollapsibleContent>
  );
}

function CollapsibleItemGroupItemGroup({ className, ...props }: ComponentProps<typeof ItemGroup>) {
  return <ItemGroup className={cn("flex-1", className)} {...props} />;
}

export function CollapsibleItemGroup({
  children,
  itemCount,
  alwaysShowItemCount = false,
  defaultOpen,
  className,
  ...props
}: CollapsibleItemGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  let title: ReactNode;
  let actions: ReactNode;
  let content: ReactNode;
  const otherChildren: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === CollapsibleItemGroupTitle) title = child;
    else if (child.type === CollapsibleItemGroupActions) actions = child;
    else if (child.type === CollapsibleItemGroupContent) content = child;
    else otherChildren.push(child);
  });

  return (
    <Collapsible
      className={cn("flex flex-col gap-2", className)}
      open={open}
      onOpenChange={setOpen}
      {...props}
    >
      <span className="flex shrink-0 items-center justify-between">
        <span className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2">
              {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
              <span className="font-medium">{title}</span>
            </Button>
          </CollapsibleTrigger>
          {itemCount !== undefined && (alwaysShowItemCount || !open) ? (
            <Badge variant="outline">{itemCount}</Badge>
          ) : null}
        </span>
        {actions}
      </span>
      {otherChildren}
      {content}
    </Collapsible>
  );
}

CollapsibleItemGroup.Title = CollapsibleItemGroupTitle;
CollapsibleItemGroup.Actions = CollapsibleItemGroupActions;
CollapsibleItemGroup.Content = CollapsibleItemGroupContent;
CollapsibleItemGroup.ItemGroup = CollapsibleItemGroupItemGroup;
