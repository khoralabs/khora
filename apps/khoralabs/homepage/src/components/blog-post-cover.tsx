import { cn } from "@/lib/utils";

/** Wide hero crop shared by blog index cards and post pages (21:9). */
export const blogPostCoverAspectClass = "aspect-[21/9]";

type BlogPostCoverProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
};

export function BlogPostCover({ src, alt, className, loading = "lazy" }: BlogPostCoverProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-md border border-[#F4F4EF]/15",
        blogPostCoverAspectClass,
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 size-full object-cover object-center"
        loading={loading}
        decoding="async"
      />
    </div>
  );
}
