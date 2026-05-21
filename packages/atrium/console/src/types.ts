export type ConsolePrincipal = {
  id: string;
  role: "root" | "admin" | "readonly";
};

export type ConsoleAuth = {
  /** null = unauthenticated */
  authenticate(req: Request): Promise<ConsolePrincipal | null>;
  /** login / logout / session routes under /admin/api/* */
  route?(req: Request, url: URL): Promise<Response | undefined>;
};
