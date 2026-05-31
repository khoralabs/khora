import { defineWebUi } from "@khoralabs/bun-web";

export default defineWebUi({
  serverEntry: "./src/index.ts",
  outdir: "dist",
  mounts: [
    {
      name: "admin",
      html: "./src/routes/admin/index.html",
      routes: [
        "/admin",
        "/admin/",
        "/admin/hosts",
        "/admin/hosts/*",
        "/admin/lookup",
        "/admin/lookup/*",
      ],
    },
    {
      name: "admin-login",
      html: "./src/routes/admin/login/index.html",
      routes: ["/admin/login", "/admin/login/"],
    },
    {
      name: "cli-link",
      html: "./src/routes/cli/link/index.html",
      routes: ["/cli/link", "/cli/link/"],
    },
  ],
});
