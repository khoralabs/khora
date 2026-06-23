import { Avatar, AvatarFallback, AvatarImage } from "#components/ui/avatar.tsx";
import { cn } from "#lib/utils.ts";

export type ChatAuthor = {
  name: string;
  avatarUrl?: string | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase() || "?";
}

export function ChatAuthorAvatar({
  author,
  size = "sm",
  className,
}: {
  author: ChatAuthor;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar className={className} size={size}>
      {author.avatarUrl ? <AvatarImage alt={author.name} src={author.avatarUrl} /> : null}
      <AvatarFallback>{initials(author.name)}</AvatarFallback>
    </Avatar>
  );
}

export function chatAuthorLabel(author: ChatAuthor | null | undefined): string | null {
  if (!author?.name) return null;
  return author.name;
}

export function authorClassName(shimmer = false): string {
  return cn(shimmer && "animate-pulse opacity-70");
}
