import type { LucideIcon } from "lucide-react";

type ComingSoonProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
};

export function ComingSoon({ title, description, icon: Icon }: ComingSoonProps) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        {Icon !== undefined ? <Icon className="size-8 text-muted-foreground" /> : null}
        <p className="mt-3 text-sm font-medium">Coming soon</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
