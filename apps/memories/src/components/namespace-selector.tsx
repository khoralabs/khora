import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type NamespaceSelectorProps = {
  value: string;
  onValueChange: (v: string) => void;
  knownNamespaces: string[];
  knownLoading?: boolean;
  knownError?: string | null;
  disabled?: boolean;
  className?: string;
};

export function NamespaceSelector({
  value,
  onValueChange,
  knownNamespaces,
  knownLoading = false,
  knownError = null,
  disabled = false,
  className,
}: NamespaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filteredNs = !q
    ? knownNamespaces
    : knownNamespaces.filter((ns) => ns.toLowerCase().includes(q));

  const customExact = search.trim();
  const showCustom = customExact.length > 0 && !knownNamespaces.includes(customExact);
  const showNoMatches = filteredNs.length === 0 && !showCustom;

  /** Close popover first, then apply after paint so Radix/cmdk layout and the graph canvas do not ResizeObserver-fight. */
  const commitNamespace = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setOpen(false);
    setSearch("");
    requestAnimationFrame(() => {
      onValueChange(trimmed);
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          aria-label="Namespace"
          title={value}
          className={cn(
            "h-9 w-full min-w-0 max-w-full flex-1 justify-between rounded-none border-0 font-normal shadow-none",
            "hover:bg-transparent focus-visible:ring-0 dark:hover:bg-transparent",
            "data-placeholder:text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left text-sm">{value || "Namespace"}</span>
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width,20rem)] max-w-lg"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a namespace…"
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const t = search.trim();
                if (t) commitNamespace(t);
              }
            }}
          />
          <CommandList>
            {showNoMatches && (
              <CommandEmpty>
                {knownLoading
                  ? "Loading namespaces…"
                  : knownError
                    ? `Could not load: ${knownError}`
                    : "Type a new namespace and press Enter, or pick one from the list."}
              </CommandEmpty>
            )}

            {filteredNs.length > 0 && (
              <CommandGroup heading="In database">
                {filteredNs.map((ns) => (
                  <CommandItem
                    key={ns}
                    value={ns}
                    onSelect={() => commitNamespace(ns)}
                  >
                    <Check
                      className={cn("mr-2 size-4 shrink-0", value === ns ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="min-w-0 break-all">{ns}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {showCustom && (
              <CommandGroup heading="Custom">
                <CommandItem
                  value={`~custom~${customExact}`}
                  onSelect={() => commitNamespace(customExact)}
                >
                  Use &quot;{customExact}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
