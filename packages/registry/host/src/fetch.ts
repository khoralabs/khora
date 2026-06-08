import { handleOptions, withCors } from "./cors";
import {
  handleAdminAccountDelete,
  handleAdminAccountReactivate,
  handleAdminAccountReactivateByEmail,
  handleAdminAccountSuspend,
} from "./routes/admin/accounts";
import { routeConsoleAuth } from "./routes/admin/console-guard";
import {
  handleAdminHostActivate,
  handleAdminHostDelete,
  handleAdminHostOriginRequestApprove,
  handleAdminHostOriginRequestReject,
  handleAdminHostOriginRequests,
  handleAdminHostQuotaRequestApprove,
  handleAdminHostQuotaRequestReject,
  handleAdminHostQuotaRequests,
  handleAdminHostReactivate,
  handleAdminHostRegistry,
  handleAdminHostSuspend,
} from "./routes/admin/hosts";
import { handleLookupAccount, handleLookupEmail } from "./routes/admin/lookup";
import { handleAdminStatsSummary } from "./routes/admin/stats";
import { handleHostRegistrationClaim, handleHostRegistrationGet } from "./routes/host-registration";
import {
  handleHostRegistryGet,
  handleHostRegistryOriginDelete,
  handleHostRegistryOriginRequestDelete,
  handleHostRegistryOriginRequestPost,
  handleHostRegistryQuotaRequestDelete,
  handleHostRegistryQuotaRequestPost,
} from "./routes/host-registry";
import { handleHostGet, handleHostRegister, handleHostsList } from "./routes/hosts";
import {
  handleLinkAgent,
  handleLinkAgentEnsure,
  handleLinkChallenge,
  handleLinkStatus,
  handleLinkUnlink,
} from "./routes/link";
import { handleMe } from "./routes/me";
import type { RegistryHostRuntime } from "./runtime";

export async function dispatchRegistryHostFetch(
  runtime: RegistryHostRuntime,
  req: Request,
): Promise<Response> {
  const options = handleOptions(req);
  if (options !== null) return options;

  const url = new URL(req.url);
  const path = url.pathname;

  const consoleRoute = await routeConsoleAuth(req, url, runtime.consoleAuth);
  if (consoleRoute !== undefined) {
    return withCors(req, consoleRoute);
  }

  if (path === "/health") {
    return withCors(req, Response.json({ ok: true }));
  }

  if (path === "/admin/api/stats/summary" && req.method === "GET") {
    return withCors(req, await handleAdminStatsSummary(req, runtime.consoleAuth));
  }

  if (path === "/admin/api/lookup/email" && req.method === "GET") {
    return withCors(req, await handleLookupEmail(req, url, runtime.consoleAuth));
  }

  if (path === "/admin/api/lookup/account" && req.method === "GET") {
    return withCors(req, await handleLookupAccount(req, url, runtime.consoleAuth));
  }

  if (
    path.startsWith("/admin/api/accounts/") &&
    path.endsWith("/suspend") &&
    req.method === "POST"
  ) {
    const id = path.slice("/admin/api/accounts/".length, -"/suspend".length);
    return withCors(req, await handleAdminAccountSuspend(req, runtime.consoleAuth, id));
  }

  if (
    path.startsWith("/admin/api/accounts/") &&
    path.endsWith("/reactivate") &&
    req.method === "POST"
  ) {
    const id = path.slice("/admin/api/accounts/".length, -"/reactivate".length);
    return withCors(req, await handleAdminAccountReactivate(req, runtime.consoleAuth, id));
  }

  if (path === "/admin/api/accounts/reactivate-by-email" && req.method === "POST") {
    return withCors(req, await handleAdminAccountReactivateByEmail(req, runtime.consoleAuth));
  }

  if (path.startsWith("/admin/api/accounts/") && req.method === "DELETE") {
    const id = path.slice("/admin/api/accounts/".length);
    if (id.length > 0 && !id.includes("/")) {
      return withCors(req, await handleAdminAccountDelete(req, runtime.consoleAuth, id));
    }
  }

  if (path.startsWith("/admin/api/hosts/") && path.endsWith("/suspend") && req.method === "POST") {
    const id = path.slice("/admin/api/hosts/".length, -"/suspend".length);
    return withCors(req, await handleAdminHostSuspend(req, runtime.consoleAuth, id));
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.endsWith("/reactivate") &&
    req.method === "POST"
  ) {
    const id = path.slice("/admin/api/hosts/".length, -"/reactivate".length);
    return withCors(req, await handleAdminHostReactivate(req, runtime.consoleAuth, id));
  }

  if (path.startsWith("/admin/api/hosts/") && req.method === "DELETE") {
    const id = path.slice("/admin/api/hosts/".length);
    if (id.length > 0 && !id.includes("/")) {
      return withCors(req, await handleAdminHostDelete(req, runtime.consoleAuth, id));
    }
  }

  if (path.startsWith("/admin/api/hosts/") && path.endsWith("/activate") && req.method === "POST") {
    const id = path.slice("/admin/api/hosts/".length, -"/activate".length);
    return withCors(req, await handleAdminHostActivate(req, runtime.consoleAuth, id));
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.endsWith("/origin-requests") &&
    req.method === "GET"
  ) {
    const id = path.slice("/admin/api/hosts/".length, -"/origin-requests".length);
    return withCors(req, await handleAdminHostOriginRequests(req, runtime.consoleAuth, id));
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.includes("/origin-requests/") &&
    path.endsWith("/approve") &&
    req.method === "POST"
  ) {
    const middle = path.slice("/admin/api/hosts/".length, -"/approve".length);
    const slash = middle.lastIndexOf("/origin-requests/");
    if (slash > 0) {
      const id = middle.slice(0, slash);
      const requestId = middle.slice(slash + "/origin-requests/".length);
      return withCors(
        req,
        await handleAdminHostOriginRequestApprove(req, runtime.consoleAuth, id, requestId),
      );
    }
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.includes("/origin-requests/") &&
    path.endsWith("/reject") &&
    req.method === "POST"
  ) {
    const middle = path.slice("/admin/api/hosts/".length, -"/reject".length);
    const slash = middle.lastIndexOf("/origin-requests/");
    if (slash > 0) {
      const id = middle.slice(0, slash);
      const requestId = middle.slice(slash + "/origin-requests/".length);
      return withCors(
        req,
        await handleAdminHostOriginRequestReject(req, runtime.consoleAuth, id, requestId),
      );
    }
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.endsWith("/quota-requests") &&
    req.method === "GET"
  ) {
    const id = path.slice("/admin/api/hosts/".length, -"/quota-requests".length);
    return withCors(req, await handleAdminHostQuotaRequests(req, runtime.consoleAuth, id));
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.includes("/quota-requests/") &&
    path.endsWith("/approve") &&
    req.method === "POST"
  ) {
    const middle = path.slice("/admin/api/hosts/".length, -"/approve".length);
    const slash = middle.lastIndexOf("/quota-requests/");
    if (slash > 0) {
      const id = middle.slice(0, slash);
      const requestId = middle.slice(slash + "/quota-requests/".length);
      return withCors(
        req,
        await handleAdminHostQuotaRequestApprove(req, runtime.consoleAuth, id, requestId),
      );
    }
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.includes("/quota-requests/") &&
    path.endsWith("/reject") &&
    req.method === "POST"
  ) {
    const middle = path.slice("/admin/api/hosts/".length, -"/reject".length);
    const slash = middle.lastIndexOf("/quota-requests/");
    if (slash > 0) {
      const id = middle.slice(0, slash);
      const requestId = middle.slice(slash + "/quota-requests/".length);
      return withCors(
        req,
        await handleAdminHostQuotaRequestReject(req, runtime.consoleAuth, id, requestId),
      );
    }
  }

  if (
    path.startsWith("/admin/api/hosts/") &&
    path.endsWith("/registry") &&
    req.method === "PATCH"
  ) {
    const id = path.slice("/admin/api/hosts/".length, -"/registry".length);
    return withCors(req, await handleAdminHostRegistry(req, runtime.consoleAuth, id));
  }

  if (path.startsWith("/v1/hosts/") && path.includes("/registry/")) {
    const registryPrefix = "/v1/hosts/";
    const registrySuffix = path.slice(registryPrefix.length);
    const slashIdx = registrySuffix.indexOf("/registry/");
    if (slashIdx > 0) {
      const slug = registrySuffix.slice(0, slashIdx);
      const subPath = registrySuffix.slice(slashIdx + "/registry".length);
      if (subPath === "/origin-requests" && req.method === "POST") {
        return withCors(req, await handleHostRegistryOriginRequestPost(req, slug));
      }
      if (subPath.startsWith("/origin-requests/") && req.method === "DELETE") {
        const requestId = subPath.slice("/origin-requests/".length);
        if (requestId.length > 0) {
          return withCors(req, handleHostRegistryOriginRequestDelete(req, slug, requestId));
        }
      }
      if (subPath === "/quota-requests" && req.method === "POST") {
        return withCors(req, await handleHostRegistryQuotaRequestPost(req, slug));
      }
      if (subPath.startsWith("/quota-requests/") && req.method === "DELETE") {
        const requestId = subPath.slice("/quota-requests/".length);
        if (requestId.length > 0) {
          return withCors(req, handleHostRegistryQuotaRequestDelete(req, slug, requestId));
        }
      }
      if (subPath === "/origins" && req.method === "DELETE") {
        return withCors(req, await handleHostRegistryOriginDelete(req, slug));
      }
    }
  }

  if (path.startsWith("/v1/hosts/") && path.endsWith("/registry")) {
    const slug = path.slice("/v1/hosts/".length, -"/registry".length);
    if (slug.length > 0 && req.method === "GET") {
      return withCors(req, handleHostRegistryGet(req, slug));
    }
  }

  if (path.startsWith("/v1/hosts/") && path.endsWith("/registration/claim")) {
    const slug = path.slice("/v1/hosts/".length, -"/registration/claim".length);
    if (slug.length > 0 && req.method === "POST") {
      return withCors(req, await handleHostRegistrationClaim(req, slug));
    }
  }

  if (path.startsWith("/v1/hosts/") && path.endsWith("/registration")) {
    const slug = path.slice("/v1/hosts/".length, -"/registration".length);
    if (slug.length > 0 && req.method === "GET") {
      return withCors(req, handleHostRegistrationGet(req, slug));
    }
  }

  if (path === "/v1/hosts" && req.method === "GET") {
    return withCors(req, handleHostsList());
  }

  if (path === "/v1/hosts/register" && req.method === "POST") {
    return withCors(req, await handleHostRegister(req));
  }

  if (path.startsWith("/v1/hosts/") && req.method === "GET") {
    const slug = path.slice("/v1/hosts/".length);
    if (slug.length > 0 && slug !== "register") {
      return withCors(req, handleHostGet(slug));
    }
  }

  if (path === "/v1/me" && req.method === "GET") {
    return withCors(req, await handleMe(req));
  }

  if (path === "/v1/link/challenge" && req.method === "GET") {
    return withCors(req, await handleLinkChallenge(req, url));
  }

  if (path === "/v1/link/agent/ensure" && req.method === "POST") {
    return withCors(req, await handleLinkAgentEnsure(req));
  }

  if (path === "/v1/link/agent" && req.method === "POST") {
    return withCors(req, await handleLinkAgent(req));
  }

  if (path === "/v1/link/status" && req.method === "GET") {
    return withCors(req, await handleLinkStatus(req));
  }

  if (path === "/v1/link/agent" && req.method === "DELETE") {
    return withCors(req, await handleLinkUnlink(req));
  }

  return withCors(req, Response.json({ error: "Not found" }, { status: 404 }));
}
