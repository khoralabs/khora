import type { ComponentType } from "react";

/** Props supported by MDX compiled with `jsxImportSource: "react"`. */
export type MdxRootProps = {
  components?: Record<string, ComponentType<Record<string, unknown>>>;
};

export type MDXDocumentModule = {
  default: ComponentType<MdxRootProps>;
  metadata?: { size: string; lastModified: string; path: string };
  raw?: string;
};
