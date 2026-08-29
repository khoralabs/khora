export type StandingSearchContent = {
  text?: string;
  vector?: number[];
};

export type StandingSearchLabels = {
  all?: string[];
  some?: string[];
};

export type StandingSearchOptions = {
  minScore?: number;
  labels?: StandingSearchLabels;
  arms?: {
    lexical?: number;
    vector?: number;
  };
  maxVectorDistance?: number;
};

export type StandingSearchScopeMode = "pathSubtree" | "scopeDag" | "exactScope";

export type StandingSearchRequest = {
  namespace?: string;
  additionalNamespaces?: string[];
  searchEntireDatabase?: true;
  searchScopeMode?: StandingSearchScopeMode;
  content: StandingSearchContent;
  options?: StandingSearchOptions;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === "number");
}

function fail(path: string, message: string): never {
  throw new Error(`StandingSearchRequest.${path}: ${message}`);
}

function parseContent(value: unknown): StandingSearchContent {
  if (!isPlainObject(value)) fail("content", "expected object");
  const out: StandingSearchContent = {};
  if (value.text !== undefined) {
    if (typeof value.text !== "string") fail("content.text", "expected string");
    out.text = value.text;
  }
  if (value.vector !== undefined) {
    if (!isNumberArray(value.vector)) fail("content.vector", "expected number[]");
    out.vector = value.vector;
  }
  return out;
}

function parseLabels(value: unknown): StandingSearchLabels {
  if (!isPlainObject(value)) fail("options.labels", "expected object");
  const out: StandingSearchLabels = {};
  if (value.all !== undefined) {
    if (!isStringArray(value.all)) fail("options.labels.all", "expected string[]");
    out.all = value.all;
  }
  if (value.some !== undefined) {
    if (!isStringArray(value.some)) fail("options.labels.some", "expected string[]");
    out.some = value.some;
  }
  return out;
}

function parseOptions(value: unknown): StandingSearchOptions {
  if (!isPlainObject(value)) fail("options", "expected object");
  const out: StandingSearchOptions = {};
  if (value.minScore !== undefined) {
    if (typeof value.minScore !== "number") fail("options.minScore", "expected number");
    out.minScore = value.minScore;
  }
  if (value.labels !== undefined) out.labels = parseLabels(value.labels);
  if (value.arms !== undefined) {
    if (!isPlainObject(value.arms)) fail("options.arms", "expected object");
    const arms: { lexical?: number; vector?: number } = {};
    if (value.arms.lexical !== undefined) {
      if (typeof value.arms.lexical !== "number") fail("options.arms.lexical", "expected number");
      arms.lexical = value.arms.lexical;
    }
    if (value.arms.vector !== undefined) {
      if (typeof value.arms.vector !== "number") fail("options.arms.vector", "expected number");
      arms.vector = value.arms.vector;
    }
    out.arms = arms;
  }
  if (value.maxVectorDistance !== undefined) {
    if (typeof value.maxVectorDistance !== "number") {
      fail("options.maxVectorDistance", "expected number");
    }
    out.maxVectorDistance = value.maxVectorDistance;
  }
  return out;
}

const SCOPE_MODES = new Set<StandingSearchScopeMode>(["pathSubtree", "scopeDag", "exactScope"]);

/** Parse and validate a standing search request (replaces former Zod schema). */
export function parseStandingSearchRequest(value: unknown): StandingSearchRequest {
  if (!isPlainObject(value)) fail("", "expected object");
  if (value.content === undefined) fail("content", "required");

  const out: StandingSearchRequest = {
    content: parseContent(value.content),
  };

  if (value.namespace !== undefined) {
    if (typeof value.namespace !== "string") fail("namespace", "expected string");
    out.namespace = value.namespace;
  }
  if (value.additionalNamespaces !== undefined) {
    if (!isStringArray(value.additionalNamespaces)) {
      fail("additionalNamespaces", "expected string[]");
    }
    out.additionalNamespaces = value.additionalNamespaces;
  }
  if (value.searchEntireDatabase !== undefined) {
    if (value.searchEntireDatabase !== true) {
      fail("searchEntireDatabase", "expected literal true");
    }
    out.searchEntireDatabase = true;
  }
  if (value.searchScopeMode !== undefined) {
    if (
      typeof value.searchScopeMode !== "string" ||
      !SCOPE_MODES.has(value.searchScopeMode as StandingSearchScopeMode)
    ) {
      fail("searchScopeMode", 'expected "pathSubtree" | "scopeDag" | "exactScope"');
    }
    out.searchScopeMode = value.searchScopeMode as StandingSearchScopeMode;
  }
  if (value.options !== undefined) out.options = parseOptions(value.options);

  return out;
}
