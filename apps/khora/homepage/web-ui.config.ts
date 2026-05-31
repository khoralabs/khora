import { defineWebUi } from "@khoralabs/bun-web";

export default defineWebUi({
  serverEntry: "./src/index.ts",
  outdir: "dist",
  mounts: [
    {
      name: "index",
      html: "./src/routes/index.html",
      routes: ["/*"],
    },
    {
      name: "login",
      html: "./src/routes/login/index.html",
      routes: ["/login", "/login/"],
    },
  ],
});
