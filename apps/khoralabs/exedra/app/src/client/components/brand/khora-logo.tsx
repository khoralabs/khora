import { ASSETS } from "@/lib/asset-urls";
import { cn } from "@/lib/utils";

type KhoraIconProps = {
  className?: string;
};

export function KhoraIcon({ className }: KhoraIconProps) {
  return (
    <img
      src={ASSETS.iconSvg}
      alt="Khora"
      width={28}
      height={28}
      className={cn("size-7 shrink-0", className)}
    />
  );
}

type KhoraWordmarkProps = {
  className?: string;
};

export function KhoraWordmark({ className }: KhoraWordmarkProps) {
  return (
    <>
      <img
        src={ASSETS.logoBlack}
        alt="Khora"
        width={130}
        height={37}
        className={cn("h-3.5 w-auto dark:hidden", className)}
      />
      <img
        src={ASSETS.logoWhite}
        alt="Khora"
        width={130}
        height={37}
        className={cn("hidden h-3.5 w-auto dark:block", className)}
      />
    </>
  );
}

type ExedraBrandProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
};

export function ExedraBrand({ collapsed = false, onNavigate, className }: ExedraBrandProps) {
  const content = collapsed ? (
    <KhoraIcon />
  ) : (
    <div className="flex min-w-0 flex-col gap-0.5">
      <KhoraWordmark />
      <span className="font-serif text-xs text-muted-foreground">Exedra</span>
    </div>
  );

  if (onNavigate === undefined) {
    return <div className={cn(collapsed && "flex justify-center", className)}>{content}</div>;
  }

  return (
    <div className={cn(collapsed && "flex justify-center", className)}>
      <button
        type="button"
        onClick={onNavigate}
        className="rounded-md transition-opacity hover:opacity-80"
        aria-label="Exedra home"
      >
        {content}
      </button>
    </div>
  );
}
