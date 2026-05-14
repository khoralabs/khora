import type { MDXDocumentModule } from "../post";

declare module "*.mdx" {
  const MDXContent: MDXDocumentModule["default"];
  export const metadata: MDXDocumentModule["metadata"];
  export const raw: MDXDocumentModule["raw"];
  export default MDXContent;
}

declare module "*.md" {
  const MDXContent: MDXDocumentModule["default"];
  export const metadata: MDXDocumentModule["metadata"];
  export const raw: MDXDocumentModule["raw"];
  export default MDXContent;
}
