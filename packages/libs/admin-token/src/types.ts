export type AdminPrincipal = {
  id: string;
  role: "root" | "admin" | "readonly";
};

export type AdminTokenAuth = {
  /** null = unauthenticated */
  authenticate(req: Request): Promise<AdminPrincipal | null>;
  /** login / logout / session routes under /admin/api/* */
  route?(req: Request, url: URL): Promise<Response | undefined>;
};
