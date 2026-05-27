import type { MdxRootProps } from "@khoralabs/blog";
import type { ComponentProps, ComponentType } from "react";
import {
  mdxArticleClass,
  mdxBlockquoteClass,
  mdxBodyMutedClass,
  mdxHeadingBaseClass,
  mdxHrClass,
  mdxLiClass,
  mdxLinkClass,
  mdxOlClass,
  mdxStrongClass,
  mdxUlClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

/** Typography overrides for MDX output on the charcoal shell (no `@tailwindcss/typography`). */
const mdxComponents = {
  h1: ({ className, ...props }: ComponentProps<"h1">) => (
    <h1 className={cn(mdxHeadingBaseClass, "mb-6 text-3xl md:text-4xl", className)} {...props} />
  ),
  h2: ({ className, ...props }: ComponentProps<"h2">) => (
    <h2
      className={cn(
        mdxHeadingBaseClass,
        "mt-10 mb-4 border-b border-[#F4F4EF]/15 pb-2 text-xl md:text-2xl",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: ComponentProps<"h3">) => (
    <h3 className={cn(mdxHeadingBaseClass, "mt-8 mb-3 text-lg md:text-xl", className)} {...props} />
  ),
  p: ({ className, ...props }: ComponentProps<"p">) => (
    <p className={cn(mdxBodyMutedClass, className)} {...props} />
  ),
  strong: ({ className, ...props }: ComponentProps<"strong">) => (
    <strong className={cn(mdxStrongClass, className)} {...props} />
  ),
  ul: ({ className, ...props }: ComponentProps<"ul">) => (
    <ul className={cn(mdxUlClass, className)} {...props} />
  ),
  ol: ({ className, ...props }: ComponentProps<"ol">) => (
    <ol className={cn(mdxOlClass, className)} {...props} />
  ),
  li: ({ className, ...props }: ComponentProps<"li">) => (
    <li className={cn(mdxLiClass, className)} {...props} />
  ),
  a: ({ className, ...props }: ComponentProps<"a">) => (
    <a className={cn(mdxLinkClass, className)} {...props} />
  ),
  hr: ({ className, ...props }: ComponentProps<"hr">) => (
    <hr className={cn(mdxHrClass, className)} {...props} />
  ),
  blockquote: ({ className, ...props }: ComponentProps<"blockquote">) => (
    <blockquote className={cn(mdxBlockquoteClass, className)} {...props} />
  ),
  img: ({ className, alt, ...props }: ComponentProps<"img">) => (
    <img
      alt={alt ?? ""}
      className={cn("my-6 h-auto w-full max-w-full rounded-md border border-[#F4F4EF]/15", className)}
      loading="lazy"
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
    <article className={cn(mdxArticleClass, className)}>
      <Content components={mdxComponents} />
    </article>
  );
}
