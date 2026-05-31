import { defineWebUi } from "@khoralabs/bun-web";

export default defineWebUi({
  serverEntry: "./src/index.ts",
  outdir: "dist",
  mounts: [
    {
      name: "app",
      html: "./src/index.html",
      routes: ["/*"],
    },
  ],
});
