import { defineWebUi } from "@khoralabs/bun-web";
import mdxPlugin from "../../../packages/khoralabs/blog/src/plugin/mdx";

export default defineWebUi({
  serverEntry: "./src/index.ts",
  outdir: "dist",
  buildEnv: "BUN_PUBLIC_*",
  plugins: [mdxPlugin],
  mounts: [
    {
      name: "index",
      html: "./src/routes/index.html",
      routes: ["/consumer", "/*"],
    },
    {
      name: "blog",
      html: "./src/routes/blog/index.html",
      routes: ["/blog"],
    },
    {
      name: "blogPost",
      html: "./src/routes/blog/post/index.html",
      routes: ["/blog/:slug"],
    },
    {
      name: "contact",
      html: "./src/routes/contact/index.html",
      routes: ["/contact"],
    },
    {
      name: "join",
      html: "./src/routes/join/index.html",
      routes: ["/join"],
    },
    {
      name: "privacy",
      html: "./src/routes/privacy/index.html",
      routes: ["/privacy"],
    },
    {
      name: "terms",
      html: "./src/routes/terms/index.html",
      routes: ["/terms"],
    },
  ],
});
