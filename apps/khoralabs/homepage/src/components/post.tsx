import type { ComponentProps, ComponentType } from "react";

import type { MdxRootProps } from "@/lib/post";

import { cn } from "@/lib/utils";

const baseHeading = "scroll-mt-20 font-normal tracking-[-0.01em] text-[#F4F4EF]";

/** Typography overrides for MDX output on the charcoal shell (no `@tailwindcss/typography`). */
const mdxComponents = {
  h1: ({ className, ...props }: ComponentProps<"h1">) => (
    <h1 className={cn(baseHeading, "mb-6 text-3xl md:text-4xl", className)} {...props} />
  ),
  h2: ({ className, ...props }: ComponentProps<"h2">) => (
    <h2
      className={cn(
        baseHeading,
        "mt-10 mb-4 border-b border-[#F4F4EF]/15 pb-2 text-xl md:text-2xl",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: ComponentProps<"h3">) => (
    <h3 className={cn(baseHeading, "mt-8 mb-3 text-lg md:text-xl", className)} {...props} />
  ),
  p: ({ className, ...props }: ComponentProps<"p">) => (
    <p className={cn("mb-4 text-[#F4F4EF]/90 last:mb-0", className)} {...props} />
  ),
  strong: ({ className, ...props }: ComponentProps<"strong">) => (
    <strong className={cn("font-medium text-[#F4F4EF]", className)} {...props} />
  ),
  ul: ({ className, ...props }: ComponentProps<"ul">) => (
    <ul
      className={cn(
        "mb-4 ml-6 list-disc space-y-2 text-[#F4F4EF]/90 marker:text-[#F4F4EF]/60",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }: ComponentProps<"ol">) => (
    <ol
      className={cn(
        "mb-4 ml-6 list-decimal space-y-2 text-[#F4F4EF]/90 marker:text-[#F4F4EF]/60",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }: ComponentProps<"li">) => (
    <li className={cn("leading-relaxed", className)} {...props} />
  ),
  a: ({ className, ...props }: ComponentProps<"a">) => (
    <a
      className={cn(
        "text-[#F4F4EF] underline decoration-[#F4F4EF]/40 underline-offset-4 transition-opacity hover:opacity-80",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }: ComponentProps<"hr">) => (
    <hr className={cn("my-8 border-[#F4F4EF]/20", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: ComponentProps<"blockquote">) => (
    <blockquote
      className={cn("my-4 border-l-2 border-[#F4F4EF]/30 pl-4 text-[#F4F4EF]/80 italic", className)}
      {...props}
    />
  ),
};

type MdxAgreementProps = {
  Content: ComponentType<MdxRootProps>;
  className?: string;
};

/** Renders a compiled MDX/Markdown module as article body content. */
export function MdxAgreement({ Content, className }: MdxAgreementProps) {
  return (
    <article className={cn("max-w-none text-left text-sm md:text-[15px]", className)}>
      <Content components={mdxComponents} />
    </article>
  );
}
