import { type Attributes, context, type Span, SpanStatusCode, trace } from "@opentelemetry/api";

export function withSpan<T>(
  tracer: ReturnType<typeof trace.getTracer>,
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, { attributes: attrs });
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function startChildSpan(
  tracer: ReturnType<typeof trace.getTracer>,
  name: string,
  attrs: Attributes,
): Span {
  const parent = trace.getSpan(context.active());
  const ctx = parent !== undefined ? trace.setSpan(context.active(), parent) : context.active();
  return tracer.startSpan(name, { attributes: attrs }, ctx);
}
