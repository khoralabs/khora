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
        "/admin/network",
        "/admin/network/*",
        "/admin/infrastructure",
        "/admin/infrastructure/*",
        "/admin/operations",
        "/admin/operations/*",
        "/admin/registry",
        "/admin/registry/*",
        "/admin/lookup",
        "/admin/lookup/*",
      ],
    },
    {
      name: "admin-login",
      html: "./src/routes/admin/login/index.html",
      routes: ["/admin/login", "/admin/login/"],
    },
  ],
});
