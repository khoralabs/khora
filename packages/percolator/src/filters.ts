import type { StandingSearchRequest } from "./search-request.ts";
import type { PercolatorCandidate } from "./types.ts";

function matchesLabelFilter(
  labelKinds: readonly string[],
  filter: { all?: string[]; some?: string[] } | undefined,
): boolean {
  if (filter === undefined) return true;
  if (filter.all !== undefined && !filter.all.every((label) => labelKinds.includes(label))) {
    return false;
  }
  if (
    filter.some !== undefined &&
    filter.some.length > 0 &&
    !filter.some.some((label) => labelKinds.includes(label))
  ) {
    return false;
  }
  return true;
}

function namespaceRoots(search: StandingSearchRequest): string[] {
  if (search.searchEntireDatabase === true) return [];
  const roots: string[] = [];
  if (search.namespace !== undefined && search.namespace.length > 0) {
    roots.push(search.namespace.replace(/\/+$/, ""));
  }
  if (search.additionalNamespaces !== undefined) {
    for (const ns of search.additionalNamespaces) {
      if (ns.length > 0) roots.push(ns.replace(/\/+$/, ""));
    }
  }
  if (roots.length === 0) roots.push("global");
  return roots;
}

function namespaceMatches(candidateNamespace: string, search: StandingSearchRequest): boolean {
  if (search.searchEntireDatabase === true) return true;
  const candidate = candidateNamespace.replace(/\/+$/, "");
  const roots = namespaceRoots(search);
  const mode = search.searchScopeMode ?? "pathSubtree";
  if (mode === "exactScope") {
    return roots.some((root) => candidate === root);
  }
  return roots.some((root) => candidate === root || candidate.startsWith(`${root}/`));
}

export function isFilterOnlyMode(search: StandingSearchRequest): boolean {
  const text = search.content.text?.trim() ?? "";
  const vector = search.content.vector;
  const hasVector = vector !== undefined && vector.length > 0;
  return text.length === 0 && !hasVector;
}

export function passesSearchFilters(
  candidate: PercolatorCandidate,
  search: StandingSearchRequest,
): boolean {
  if (!namespaceMatches(candidate.namespace, search)) return false;
  return matchesLabelFilter(candidate.labelKinds, search.options?.labels);
}
