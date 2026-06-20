import {
  startChildSpan as _startChildSpan,
  withSpan as _withSpan,
} from "@khoralabs/observability/spans";
import type { Attributes, Span } from "@opentelemetry/api";

import { tracer } from "../otel.js";

export function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return _withSpan(tracer, name, attrs, fn);
}

export function startChildSpan(name: string, attrs: Attributes): Span {
  return _startChildSpan(tracer, name, attrs);
}
