import { type ComponentType, createElement, StrictMode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { RouteErrorBoundary } from "../route-error-boundary";

export type PageHead = {
  title?: string;
  description?: string;
};

export type BunRouteRequest = Request & { params?: Record<string, string> };

export type SsrServer = { url: string | URL };

export type SsrRouteOptions<P extends Record<string, unknown> = Record<string, unknown>> = {
  props?: (req: BunRouteRequest) => P;
  head?: (req: BunRouteRequest) => PageHead | undefined;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function patchHead(html: string, head: PageHead): string {
  let result = html;
  if (head.title) {
    result = result.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(head.title)}</title>`);
  }
  if (head.description) {
    const meta = `<meta name="description" content="${escapeHtml(head.description)}" />`;
    if (/<meta name="description"/.test(result)) {
      result = result.replace(/<meta name="description" content="[^"]*"[^>]*>/, meta);
    } else {
      result = result.replace("</head>", `  ${meta}\n</head>`);
    }
  }
  return result;
}

const ROOT_PLACEHOLDER = '<div id="root"></div>';

async function fetchShellHtml(req: Request, server: SsrServer, shellPath: string): Promise<string> {
  const shellResponse = await fetch(new URL(shellPath, server.url), {
    headers: { accept: req.headers.get("accept") ?? "text/html" },
  });
  if (!shellResponse.ok) {
    throw new Error(`SSR shell fetch failed (${shellResponse.status}): ${shellPath}`);
  }
  return shellResponse.text();
}

export async function renderHtmlRoute<P extends Record<string, unknown>>(
  req: BunRouteRequest,
  server: SsrServer,
  shellPath: string,
  Page: ComponentType<P>,
  props: P = {} as P,
  head?: PageHead,
): Promise<Response> {
  const shellHtml = await fetchShellHtml(req, server, shellPath);

  const stream = await renderToReadableStream(
    createElement(
      StrictMode,
      null,
      createElement(RouteErrorBoundary, null, createElement(Page, props)),
    ),
  );
  await stream.allReady;
  const body = await new Response(stream).text();

  let html = shellHtml.includes(ROOT_PLACEHOLDER)
    ? shellHtml.replace(ROOT_PLACEHOLDER, `<div id="root">${body}</div>`)
    : shellHtml.replace(/<div id="root">\s*<\/div>/, `<div id="root">${body}</div>`);

  if (head && (head.title || head.description)) {
    html = patchHead(html, head);
  }

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function ssrRoute<P extends Record<string, unknown>>(
  shellPath: string,
  Page: ComponentType<P>,
  options?: SsrRouteOptions<P>,
): { GET: (req: BunRouteRequest, server: SsrServer) => Promise<Response> } {
  return {
    GET: (req, server) => {
      const props = (options?.props?.(req) ?? {}) as P;
      const head = options?.head?.(req);
      return renderHtmlRoute(req, server, shellPath, Page, props, head);
    },
  };
}
