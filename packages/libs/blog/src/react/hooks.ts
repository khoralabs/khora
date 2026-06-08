import { useCallback, useMemo, useSyncExternalStore } from "react";
import { filterPostsByTag, getAllTags, getPost, sortPostsByDate } from "../posts";
import type { BlogPost, BlogPostMeta } from "../types";

function subscribeToSearch(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getSearchSnapshot() {
  return window.location.search;
}

export function useBlogSearchParams(initialSearch = ""): URLSearchParams {
  const search = useSyncExternalStore(subscribeToSearch, getSearchSnapshot, () => initialSearch);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useBlogManifest<T extends BlogPostMeta>(posts: T[], initialSearch = "") {
  const searchParams = useBlogSearchParams(initialSearch);
  const activeTag = searchParams.get("tag") ?? undefined;

  const sorted = useMemo(() => sortPostsByDate(posts), [posts]);
  const filteredPosts = useMemo(() => filterPostsByTag(sorted, activeTag), [sorted, activeTag]);
  const tags = useMemo(() => getAllTags(sorted), [sorted]);

  const setTag = useCallback((tag: string | undefined) => {
    const url = new URL(window.location.href);
    if (tag) url.searchParams.set("tag", tag);
    else url.searchParams.delete("tag");
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const hrefForTag = useCallback((tag: string | undefined) => {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/\/$/, "") || "/blog";
    if (tag) url.searchParams.set("tag", tag);
    else url.searchParams.delete("tag");
    return `${url.pathname}${url.search}`;
  }, []);

  return {
    posts: sorted,
    filteredPosts,
    activeTag,
    tags,
    setTag,
    hrefForTag,
  };
}

export function usePostBySlug<T extends BlogPost>(posts: T[], slug: string): T | undefined {
  return useMemo(() => getPost(posts, slug), [posts, slug]);
}

export function getSlugFromPathname(pathname: string, basePath = "/blog"): string | undefined {
  const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const slug = pathname.slice(prefix.length).replace(/\/$/, "");
  return slug || undefined;
}
